import { randomUUID, createHash } from 'node:crypto';

const BOOTSTRAP_BASE = 'https://cloudcode-pa.googleapis.com';
const GENERATION_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse';
// Match the installed Antigravity desktop build. Google rejects stale fingerprints.
const IDE_VERSION = process.env.ANTIGRAVITY_IDE_VERSION || '1.107.0';
const NODE_USER_AGENT = `antigravity/${IDE_VERSION} darwin/arm64 google-api-nodejs-client/10.3.0`;
const CONTENT_USER_AGENT = `antigravity/ide/${IDE_VERSION} darwin/arm64`;

// Gemini 3 requires the opaque thoughtSignature returned with every functionCall
// to be replayed verbatim when that call appears in the next request's history.
// OpenAI's tool-call shape has no standard field for it, so retain it locally by
// tool_call_id. Entries are short-lived and bounded to avoid unbounded growth.
const TOOL_SIGNATURE_TTL_MS = 30 * 60 * 1000;
const TOOL_SIGNATURE_MAX = 2048;
const toolSignatureCache = new Map();

function pruneToolSignatureCache() {
  const now = Date.now();
  for (const [id, entry] of toolSignatureCache) {
    if (entry.expiresAt <= now) toolSignatureCache.delete(id);
  }
  while (toolSignatureCache.size > TOOL_SIGNATURE_MAX) {
    toolSignatureCache.delete(toolSignatureCache.keys().next().value);
  }
}

function rememberToolSignature(id, functionCall, thoughtSignature) {
  if (!id || !thoughtSignature) return;
  pruneToolSignatureCache();
  toolSignatureCache.set(id, {
    name: String(functionCall?.name || ''),
    args: functionCall?.args || {},
    thoughtSignature: String(thoughtSignature),
    expiresAt: Date.now() + TOOL_SIGNATURE_TTL_MS,
  });
}

function getToolSignature(id) {
  if (!id) return undefined;
  const entry = toolSignatureCache.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    toolSignatureCache.delete(id);
    return undefined;
  }
  return entry;
}

function metadata() {
  const platform = process.platform === 'win32' ? 5
    : process.platform === 'darwin' ? (process.arch === 'arm64' ? 2 : 1)
      : process.arch === 'arm64' ? 4 : 3;
  return { ideType: 9, platform, pluginType: 2 };
}

function nodeHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': NODE_USER_AGENT,
    'X-Goog-Api-Client': 'gl-node/22.21.1',
  };
}

async function postJson(url, accessToken, body, extraHeaders = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...nodeHeaders(accessToken), ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`Antigravity ${response.status}: ${text}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

function extractProjectId(data) {
  const project = data?.cloudaicompanionProject;
  if (typeof project === 'string') return project;
  if (project && typeof project === 'object' && typeof project.id === 'string') return project.id;
  return '';
}

function extractTierId(data) {
  if (typeof data?.currentTier?.id === 'string') return data.currentTier.id;
  if (typeof data?.tier?.id === 'string') return data.tier.id;
  if (typeof data?.tier === 'string') return data.tier;
  const tiers = Array.isArray(data?.allowedTiers) ? data.allowedTiers : [];
  const selected = tiers.find((tier) => tier?.isDefault) || tiers[0];
  return typeof selected?.id === 'string' ? selected.id : 'legacy-tier';
}

export async function discoverAntigravityProject(accessToken) {
  const meta = metadata();
  let loaded = await postJson(`${BOOTSTRAP_BASE}/v1internal:loadCodeAssist`, accessToken, { metadata: meta });
  let projectId = extractProjectId(loaded);
  const tier = extractTierId(loaded);

  if (!projectId) {
    let onboarded = {};
    try {
      onboarded = await postJson(`${BOOTSTRAP_BASE}/v1internal:onboardUser`, accessToken, {
        tier_id: tier,
        metadata: meta,
      });
    } catch (error) {
      // A failed onboarding is reported only when the following discovery also fails.
      onboarded = { onboardingError: String(error?.message || error) };
    }
    projectId = extractProjectId(onboarded);
    if (!projectId) {
      loaded = await postJson(`${BOOTSTRAP_BASE}/v1internal:loadCodeAssist`, accessToken, { metadata: meta });
      projectId = extractProjectId(loaded);
    }
  }

  if (!projectId) {
    const error = new Error('O Google não atribuiu um projeto Cloud Code à conta Antigravity. Abra o Antigravity IDE, conclua o onboarding e tente novamente.');
    error.status = 422;
    error.code = 'missing_project_id';
    throw error;
  }

  let email = '';
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) email = String((await response.json())?.email || '');
  } catch {}

  return { project_id: projectId, tier, email };
}

function dataUrlToInlineData(url) {
  if (typeof url !== 'string' || !url.startsWith('data:')) return undefined;
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/i.exec(url);
  if (!match) return undefined;
  const mimeType = match[1].toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) return undefined;
  return { inlineData: { mimeType, data: match[2].replace(/\s/g, '') } };
}

function contentToGeminiParts(content) {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (const part of content) {
    if (typeof part === 'string') { if (part) parts.push({ text: part }); continue; }
    if (part?.type === 'text' || part?.type === 'input_text' || part?.type === 'output_text') {
      if (part.text) parts.push({ text: String(part.text) });
      continue;
    }
    if (part?.type === 'image_url') {
      const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      const image = dataUrlToInlineData(url);
      if (image) parts.push(image);
      else if (url) parts.push({ text: `[Imagem não incorporada: ${url}]` });
    }
  }
  return parts;
}

function textFromContent(content) {
  return contentToGeminiParts(content).map((part) => part.text || '').filter(Boolean).join('\n');
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  const copy = structuredClone(schema);
  delete copy.$schema;
  delete copy.additionalProperties;
  return copy;
}

function openAIToolsToGemini(tools) {
  if (!Array.isArray(tools)) return undefined;
  const functionDeclarations = tools.map((entry) => {
    const fn = entry?.function || entry;
    if (!fn?.name) return null;
    return {
      name: String(fn.name),
      ...(fn.description ? { description: String(fn.description) } : {}),
      parameters: normalizeSchema(fn.parameters || fn.input_schema),
    };
  }).filter(Boolean);
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

function parseArguments(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try { return JSON.parse(value); } catch { return { input: value }; }
}

function openAIMessagesToGemini(messages) {
  const contents = [];
  const systemParts = [];
  // Only a functionResponse paired with a signed functionCall is valid to
  // Gemini. A restored/expired Harness session can contain tool calls whose
  // signature lived in a previous proxy process; replaying those produces the
  // opaque generic INVALID_ARGUMENT response from Cloud Code.
  const signedToolCalls = new Set();
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.role;
    if (role === 'system' || role === 'developer') {
      const text = textFromContent(message.content);
      if (text) systemParts.push({ text });
      continue;
    }
    if (role === 'tool') {
      const cached = getToolSignature(message.tool_call_id);
      if (cached && signedToolCalls.has(message.tool_call_id)) {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: {
            id: message.tool_call_id || undefined,
            name: String(message.name || message.tool_name || cached.name),
            response: { result: textFromContent(message.content) },
          } }],
        });
      } else {
        // A signature cannot be reconstructed after a server restart. Preserve
        // the useful tool result as text, but do not send an invalid orphan
        // functionResponse/functionCall pair to Gemini.
        const name = String(message.name || message.tool_name || cached?.name || 'tool');
        contents.push({ role: 'user', parts: [{ text: `[Resultado da ferramenta ${name}]\n${textFromContent(message.content)}` }] });
      }
      continue;
    }
    const parts = contentToGeminiParts(message?.content);
    for (const call of Array.isArray(message?.tool_calls) ? message.tool_calls : []) {
      const fn = call?.function || call;
      if (fn?.name) {
        const cached = getToolSignature(call.id);
        const functionCall = {
          name: String(fn.name),
          args: parseArguments(fn.arguments),
          ...(call.id ? { id: call.id } : {}),
        };
        if (cached?.thoughtSignature) {
          signedToolCalls.add(call.id);
          parts.push({ thoughtSignature: cached.thoughtSignature, functionCall });
        } else {
          // Do not replay an orphan OpenAI tool call as Gemini functionCall.
          // Its mandatory thoughtSignature was issued by an earlier process.
          parts.push({ text: `[Chamada anterior da ferramenta ${functionCall.name}]\n${JSON.stringify(functionCall.args)}` });
        }
      }
    }
    if (parts.length) contents.push({ role: role === 'assistant' ? 'model' : 'user', parts });
  }
  while (contents.length > 1 && contents.at(-1)?.role === 'model') contents.pop();
  return {
    contents,
    ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
  };
}

function stableSessionId(seed) {
  const value = createHash('sha256').update(seed || randomUUID()).digest().readBigInt64BE();
  return value.toString();
}

const MODEL_ALIASES = {
  // Harness catalog aliases → live Cloud Code model IDs (fetchAvailableModels).
  'gemini-3.7-flash-high': 'gemini-3-flash',
  'gemini-3.7-flash-medium': 'gemini-3-flash',
  'gemini-3.7-flash-low': 'gemini-3-flash',
  'gemini-3.7-flash-tiered': 'gemini-3-flash',
  'gemini-pro-agent': 'gemini-2.5-pro',
  'gemini-3.1-pro-low': 'gemini-2.5-pro',
  'gemini-3.1-flash-lite': 'gemini-2.5-flash-lite',
  'claude-opus-4-6-thinking': 'claude-opus-5-5-medium',
  'claude-sonnet-4-6': 'claude-sonnet-5-5-medium',
};

export function buildAntigravityEnvelope(openAI, grant) {
  const requestedModel = String(openAI.model || '').replace(/^antigravity\//, '');
  const model = MODEL_ALIASES[requestedModel] || requestedModel;
  const translated = openAIMessagesToGemini(openAI.messages);
  if (!translated.contents.length) throw new Error('A requisição não contém mensagens utilizáveis.');
  const tools = openAIToolsToGemini(openAI.tools);
  const trajectoryId = randomUUID();
  const requestId = `agent/${randomUUID()}/${Date.now()}/${trajectoryId}/2`;
  const generationConfig = {
    topK: 40,
    topP: Number.isFinite(openAI.top_p) ? openAI.top_p : 1,
    ...(Number.isFinite(openAI.temperature) ? { temperature: openAI.temperature } : {}),
    ...(Number.isFinite(openAI.max_tokens) ? { maxOutputTokens: openAI.max_tokens } : {}),
    ...(Number.isFinite(openAI.max_completion_tokens) ? { maxOutputTokens: openAI.max_completion_tokens } : {}),
    ...(Array.isArray(openAI.stop) ? { stopSequences: openAI.stop } : typeof openAI.stop === 'string' ? { stopSequences: [openAI.stop] } : {}),
  };
  return {
    project: grant.project_id,
    model,
    userAgent: 'antigravity',
    requestType: 'agent',
    requestId,
    request: {
      ...translated,
      generationConfig,
      ...(tools ? { tools, toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } } } : {}),
      sessionId: stableSessionId(grant.email || grant.project_id),
      labels: {
        last_step_index: '1',
        trajectory_id: trajectoryId,
        used_claude: String(/claude/i.test(model)),
        used_claude_conservative: String(/claude/i.test(model)),
      },
    },
  };
}

export async function requestAntigravity(accessToken, projectId, envelope) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'User-Agent': CONTENT_USER_AGENT,
    'x-goog-user-project': projectId,
  };
  let response = await fetch(GENERATION_URL, { method: 'POST', headers, body: JSON.stringify(envelope) });
  if (response.status === 403) {
    const retryHeaders = { ...headers };
    delete retryHeaders['x-goog-user-project'];
    response = await fetch(GENERATION_URL, { method: 'POST', headers: retryHeaders, body: JSON.stringify(envelope) });
  }
  return response;
}

export async function* parseSSEStream(body) {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = done ? '' : blocks.pop() || '';
    for (const block of blocks) {
      for (const line of block.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try { yield JSON.parse(raw); } catch {}
      }
    }
    if (done) break;
  }
}

function responsePayload(event) {
  return event?.response && typeof event.response === 'object' ? event.response : event;
}

export function extractAntigravityEvent(event) {
  const payload = responsePayload(event);
  let text = '';
  const toolCalls = [];
  let finishReason = null;
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === 'string' && !part.thought) text += part.text;
      if (part?.functionCall?.name) {
        // Prefer Google's stable call id so the following tool result can recover
        // the exact opaque thoughtSignature from the local cache.
        const callId = String(part.functionCall.id || `call_${randomUUID().replaceAll('-', '').slice(0, 24)}`);
        rememberToolSignature(callId, part.functionCall, part.thoughtSignature || part.thought_signature);
        toolCalls.push({
          id: callId,
          type: 'function',
          function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) },
        });
      }
    }
    if (candidate?.finishReason) {
      finishReason = candidate.finishReason === 'STOP' ? 'stop' : candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop';
    }
  }
  const usage = payload?.usageMetadata ? {
    prompt_tokens: payload.usageMetadata.promptTokenCount || 0,
    completion_tokens: payload.usageMetadata.candidatesTokenCount || 0,
    total_tokens: payload.usageMetadata.totalTokenCount || 0,
  } : undefined;
  return { text, toolCalls, finishReason, usage };
}

export async function collectOpenAIResponse(upstream, model) {
  let text = '';
  const toolCalls = [];
  let finishReason = 'stop';
  let usage;
  for await (const event of parseSSEStream(upstream.body)) {
    const part = extractAntigravityEvent(event);
    text += part.text;
    toolCalls.push(...part.toolCalls);
    if (part.finishReason) finishReason = part.finishReason;
    if (part.usage) usage = part.usage;
  }
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: toolCalls.length ? { role: 'assistant', content: text || null, tool_calls: toolCalls } : { role: 'assistant', content: text },
      finish_reason: toolCalls.length ? 'tool_calls' : finishReason,
    }],
    ...(usage ? { usage } : {}),
  };
}

export async function streamOpenAIResponse(upstream, model, res) {
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const send = (delta, finishReason = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`);
  send({ role: 'assistant', content: '' });
  let finalReason = 'stop';
  for await (const event of parseSSEStream(upstream.body)) {
    const part = extractAntigravityEvent(event);
    if (part.text) send({ content: part.text });
    if (part.toolCalls.length) send({ tool_calls: part.toolCalls.map((call, index) => ({ index, ...call })) });
    if (part.finishReason) finalReason = part.toolCalls.length ? 'tool_calls' : part.finishReason;
  }
  send({}, finalReason);
  res.write('data: [DONE]\n\n');
  res.end();
}
