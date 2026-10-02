# Follow-up Suggestions & Quick Actions Design Specification

> **Feature Goal:** Transform trailing follow-up questions and next-step prompts in assistant messages into obvious, visually distinguished, and interactive quick-reply cards with clickable suggestion chips.

---

## 1. Problem Statement

In conversational AI responses (as shown in recent user chats), the assistant frequently concludes with follow-up proposals or next-step questions, such as:

```markdown
---
Want me to dive deeper into a specific era (Barcelona's peak, the World Cup campaign, his Inter Miami impact), his tactical evolution, or how he compares with other all-time greats?
```

Currently, this is rendered as standard monospace body text right below an ultra-faint 1px horizontal rule (`<hr>`):
- **No Visual Distinction:** The text uses the identical font, size, weight, and color as the main body.
- **Low Discoverability:** Users easily miss that the assistant is waiting for or offering specific directions.
- **Zero Interactivity:** Users must manually retype, copy-paste, or draft a follow-up response rather than clicking an obvious prompt.

---

## 2. Proposed Solution & Architecture

We propose introducing a dedicated **Follow-up Action Card** with **Interactive Quick-Action Chips** rendered at the bottom of assistant message bubbles.

### Visual Concept

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Main assistant response content, tables, code blocks, diagrams...]        │
│                                                                             │
│  ╭───────────────────────────────────────────────────────────────────────╮  │
│  │ ✨ Suggested Next Steps                                               │  │
│  │                                                                       │  │
│  │ "Want me to dive deeper into a specific era, his tactical evolution,  │  │
│  │  or how he compares with other all-time greats?"                      │  │
│  │                                                                       │  │
│  │ [ 🏷️ Barcelona's peak ]  [ 🏷️ World Cup campaign ]                      │  │
│  │ [ 🏷️ Inter Miami impact ]  [ 🏷️ Tactical evolution ]                   │  │
│  │ [ 🏷️ Comparison with all-time greats ]                                │  │
│  ╰───────────────────────────────────────────────────────────────────────╯  │
└─────────────────────────────────────────────────────────────────────────────┘
  04:54 PM · Copy
```

---

## 3. Detailed Component & Implementation Plan

### A. Detection & Parsing Strategy

Two complementary approaches to detect follow-up content cleanly:

1. **Divider + Question Pattern (`hr` followed by trailing text):**
   - In Markdown AST / tokens: When an `hr` token is followed by the final paragraph token ending with `?` or starting with:
     - `Want me to...`
     - `Would you like...`
     - `Should we...`
     - `Next steps:` / `Options:` / `Explore further:`
   - Isolate this block from standard prose so it renders as the specialized follow-up container.

2. **Option Extraction for Quick Chips:**
   - Detect lists inside parentheses: `(Barcelona's peak, the World Cup campaign, his Inter Miami impact)`
   - Detect trailing bulleted suggestion lists:
     ```markdown
     Would you like to explore:
     - Option A
     - Option B
     ```
   - Transform these items into clean, clickable action chips.

---

### B. UI Styling & Visual Design (Tailwind Tokens)

1. **Card Container:**
   ```html
   <div class="mt-4 rounded-xl border border-border/80 bg-accent/40 dark:bg-muted/30 p-3.5 shadow-2xs">
     <!-- Header Badge -->
     <div class="flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
       <Sparkles class="w-3.5 h-3.5 text-amber-500" />
       <span>Suggested Follow-up</span>
     </div>

     <!-- Question Prompt -->
     <p class="text-xs text-foreground/90 font-sans leading-relaxed mb-3">
       {{ promptText }}
     </p>

     <!-- Clickable Chips Container -->
     <div class="flex flex-wrap gap-1.5">
       <button
         v-for="chip in chips"
         :key="chip"
         type="button"
         class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-background border border-border/80 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-150 shadow-3xs cursor-pointer"
         @click="handleChipClick(chip)"
       >
         <span>{{ chip }}</span>
         <ArrowUpRight class="w-2.5 h-2.5 opacity-60" />
       </button>
     </div>
   </div>
   ```

2. **Divider Fallback (Pure CSS enhancement for `<hr>`):**
   ```css
   .markdown-body hr {
     border: 0;
     height: 1px;
     background: linear-gradient(to right, transparent, hsl(var(--border)), transparent);
     margin: 1.5rem 0 1rem;
   }

   /* Make trailing question paragraph distinct */
   .markdown-body hr + p {
     font-size: 13px;
     font-weight: 500;
     color: hsl(var(--foreground));
     background: hsl(var(--muted) / 0.4);
     border-left: 3px solid hsl(var(--primary));
     padding: 0.65rem 0.85rem;
     border-radius: 0.375rem;
   }
   ```

---

### C. Interaction Flow

1. **User clicks a Chip (e.g. `[ World Cup campaign ]`):**
   - Automatically injects into composer:
     `"Tell me more about the World Cup campaign."`
   - *Optional setting:* Either pre-fill composer for user review OR auto-send immediately.
2. **User clicks the Question Prompt itself:**
   - Pre-fills the composer with the follow-up prompt.

---

## 4. Work Breakdown for Implementation

| Step | File | Action |
| --- | --- | --- |
| 1 | `apps/web/src/components/FollowUpCard.vue` | Create dedicated Vue component with chips and action emitters |
| 2 | `apps/web/src/lib/followUpParser.ts` | Utility to extract question text and options from markdown content |
| 3 | `apps/web/src/components/ChatFeed.vue` | Mount `FollowUpCard` below the assistant's message content |
| 4 | `apps/web/src/stores/chat.ts` | Add `submitPrompt(text: string)` or `fillComposer(text: string)` handler |
| 5 | `apps/web/src/components/Composer.vue` | Listen for pre-fill events and focus composer |

---

*Document created for review and implementation.*
