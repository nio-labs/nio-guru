/**
 * Utilities for cleaning and normalizing LLM message outputs.
 */

/**
 * Strip hallucinated or leaked raw tool call strings (e.g. from models lacking native function calling)
 * such as {"name": "read_skill_file", "arguments": {...}} or <tool_call>...</tool_call>.
 */
export function cleanLeakedToolCalls(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Remove XML-style tool calls: <tool_call>...</tool_call> or <function_call>...</function_call>
  cleaned = cleaned.replace(/<\s*(?:tool_call|function_call)\s*>[\s\S]*?<\s*\/\s*(?:tool_call|function_call)\s*>/gi, '');

  // 2. Remove code-fenced tool call JSON: ```json\n{"name": ...}\n```
  cleaned = cleaned.replace(/```(?:json)?\s*\{\s*"(?:name|tool|function)"\s*:\s*"[^"]+"[\s\S]*?\}\s*```/gi, '');

  // 3. Remove standalone or leading JSON tool call objects
  cleaned = cleaned.replace(/^\s*\{\s*"(?:name|tool|function)"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|input|parameters)"\s*:\s*\{[\s\S]*?\}\s*\}\s*/gmi, '');

  return cleaned.trimStart();
}
