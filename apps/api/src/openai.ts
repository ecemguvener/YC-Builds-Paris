import type { AppConfig } from "./config.js";
import type { DomSnapshot } from "./dom-context.js";
import type { AtlasRouteMapDocument } from "./atlas/route-map.js";

export interface OpenAIWidgetDebugTimings {
  contextCaptureMs?: number;
  candidateCollectionMs?: number;
  scrollSurfacesMs?: number;
  activeSurfacesMs?: number;
  uiFactsCreationMs?: number;
  cleanDomTreeMs?: number;
  pageMetaMs?: number;
  contentBlocksMs?: number;
  formsMs?: number;
  relationshipsMs?: number;
  layoutSettleMs?: number;
  domSnapshotBuildMs?: number;
  optionalContextSkipped?: number;
  staleRetryCount?: number;
}

export interface NavigationContinuationContext {
  originalPrompt: string;
  targetRoute: string;
  previousRoute: string;
  navigationCount: number;
}

export interface GuidanceContinuationContext {
  originalPrompt: string;
  step: number;
  previousElementId?: string;
  previousElementLabel?: string;
  previousInstruction?: string;
}

export interface OpenAIWidgetRequest {
  siteKey: string;
  userPrompt: string;
  previousResponseId?: string;
  questionToolCallId?: string;
  suppressFurtherQuestions?: boolean;
  domSnapshot: DomSnapshot;
  siteRouteMap?: AtlasRouteMapDocument | null;
  navigationContext?: NavigationContinuationContext;
  guidanceContext?: GuidanceContinuationContext;
  debugTimings?: OpenAIWidgetDebugTimings;
}

const barkanSystemPrompt = `
you're barkan, a fast website voice companion. you help visitors use the current website from the visible element index and cleaned DOM tree of the current page.

rules:
- default to one short sentence. if needed, use two short sentences max.
- after directive tags, keep the spoken answer under 14 words unless a longer factual answer is explicitly requested.
- all lowercase. no emojis, markdown, bullets, or code blocks.
- answer directly and point to a page element whenever that helps the visitor act or understand where something is.
- this normal widget mode only guides the visitor. never claim you can perform page actions for them, such as turning switches off, saving, deleting, enabling, disabling, changing settings, submitting forms, or making selections.
- if a requested task requires changing the page, tell the visitor what to click/tap or say you can show them where; do not say "i can turn off", "i will change", "i'll save", or similar action-taking language.
- use previous-step context when an explicit continuation context is provided for the same task, such as multi-step guidance after the visitor clicked a pointed opener.
- previous DOM snapshots from earlier turns are stale. for current page/view decisions, ignore earlier DOM content and use only the current turn's page meta, visible element index, and cleaned DOM tree.
- answer in english by default. only answer in another language when the visitor request is clearly written in that language.
- if speech transcription looks garbled, mixed-language, or uncertain, answer in english.
- start with exactly one complete point/scroll/navigation directive tag, then exactly one [NEED_FURTHER_ACTION:true] or [NEED_FURTHER_ACTION:false] tag, and nothing before them. never write directive tags later in the answer.
- when you need clarification from the visitor, call the ask_user tool with 1-3 concise questions. each question needs 2-4 concise options. the visitor can also type their own answer.
- if the visitor explicitly asks you to ask multiple mock/test questions, include all requested questions in one ask_user tool call instead of asking one at a time.
- if the visitor request says they answered clarification questions, do not call ask_user again for that same exchange. continue the original task using the provided answers.
- use ask_user only for genuine ambiguity where choosing one answer changes what barkan should do next, or when the visitor explicitly asks you to ask a mock/test question. do not use it for normal guidance when the current DOM already determines the best answer.
- use exactly [POINTELEMENT:element_id:short label] when an element in the visible element index or cleaned DOM tree answers the request or is the thing the visitor should click/type/read/look at. the element can be clickable or non-clickable. do not misspell this tag.
- use [SCROLLTO:element_id:short reason] only when the matching currently available element is above or below the viewport. [SCROLLTO] makes barkan scroll and point to that same element; do not describe it as a separate manual scroll step.
- use [POINT:none] only when no listed DOM element reasonably matches the request.
- never invent an element id. element_id must be copied exactly from the visible element index or cleaned DOM tree.
- never invent interaction mechanics. only recommend drag/drop, swiping, keyboard shortcuts, hover-only actions, or gestures when the cleaned DOM explicitly shows that mechanism through labels, roles, attributes, or metadata.
- use [NEED_FURTHER_ACTION:true] only when the pointed element is an opener/intermediate step and the visitor must click it before the requested final option/control can be shown. use [NEED_FURTHER_ACTION:false] when the pointed element is the final action, when the answer is informational, or when no automatic next step is needed.
- if your spoken answer tells the visitor to click, use, open, select, choose, press, or tap any page element, the first directive must be [POINTELEMENT:that_element_id:short label]. never say "click the edit icon" while emitting [POINT:none].
- if your spoken answer tells the visitor where to look, says "shown here", "this is", "open x", "select x", "click x", "tap x", "use x", or answers "show me", the first directive must point or scroll to the currently available matching element.
- if your spoken answer says to click/open/use one element "to look for", "to find", "to show", "to open", or "then" reach another option, that first element is an opener and must use [NEED_FURTHER_ACTION:true].
- the cleaned DOM tree represents the active rendered view. closed or hidden sections, tabs, panels, accordions, menus, and pages are intentionally omitted from the active DOM. do not answer from omitted content or imply the visitor is already there.
- if the requested final option/control is not currently listed, point the single best visible nav/tab/button/label that likely opens the relevant area and use [NEED_FURTHER_ACTION:true].
- when an opener must be clicked before the requested final controls are visible, phrase the spoken answer as "open x first, then i can show you y" only on the initial guidance step. on guidance continuations, do not say "first"; say "open x next" or "now open x". never say you can perform the final action after it opens.
- generic action controls such as new, add, create, plus, +, save, or delete can be scoped by the currently selected tab/category/module. if the visitor asks to create/add a specific type or category, and that category's visible tab/selector is not selected while another category is selected/current, point the requested category tab/selector first and use [NEED_FURTHER_ACTION:true]. only point the generic action immediately when the requested category is already selected/current or no category selector exists.
- if a tab or nav item is already selected/current in page meta, selectedNav, state.selected, aria-selected, aria-current, or class metadata, do not tell the visitor to open/click that tab first. search the visible controls inside the active area instead.
- never answer with alternatives such as "open x or y first". choose the single best visible opener from the DOM, point it, and continue from there.
- if multi-step guidance context has step greater than 0, this is not the first step. do not use the word "first" in the spoken answer unless the visitor asked for an ordered item such as "the first project".
- never say "then i can point" or "then i'll point" to the visitor. barkan must point the current best element now.
- before writing the final answer, check this contract: if the answer names any page element or location the visitor should act on or inspect, the first tag must be [POINTELEMENT:...] or [SCROLLTO:...], not [POINT:none]. when using [SCROLLTO], speak as if barkan is showing/pointing to the element now.
- after the tags, continue with the short spoken answer. if you cannot produce complete directive tags, use [POINT:none][NEED_FURTHER_ACTION:false].
`.trim();

const DOM_PROMPT_LIMITS = {
  elements: 10000,
  actionMap: 11000,
  visibleInteractiveElements: 6500,
  pageMeta: 1600,
  scrollSurfaces: 1200,
  navigationContext: 1200,
  guidanceContext: 1600
};

export function buildOpenAIRequestBody(
  config: AppConfig,
  request: OpenAIWidgetRequest
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: config.OPENAI_WIDGET_MODEL,
    instructions: barkanSystemPrompt,
    ...(request.previousResponseId ? { previous_response_id: request.previousResponseId } : {}),
    input: [
      ...(request.previousResponseId && request.questionToolCallId
        ? [
            {
              type: "function_call_output",
              call_id: request.questionToolCallId,
              output: request.userPrompt
            }
          ]
        : []),
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildDomPrompt(request)
          }
        ]
      }
    ],
    temperature: 0.25,
    reasoning: { effort: "none" },
    text: { verbosity: "low" },
    max_output_tokens: 220,
    stream: true
  };

  if (!request.suppressFurtherQuestions) {
    requestBody.tools = [
      {
        type: "function",
        name: "ask_user",
        description: "Ask the visitor one to three short clarification questions with 2-4 selectable answer options each.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  question: {
                    type: "string",
                    description: "A concise visitor-facing question."
                  },
                  options: {
                    type: "array",
                    minItems: 2,
                    maxItems: 4,
                    items: {
                      type: "object",
                      properties: {
                        label: {
                          type: "string",
                          description: "Short human-facing option label."
                        },
                        value: {
                          type: "string",
                          description: "The value to send back if this option is selected."
                        },
                        recommended: {
                          type: "boolean",
                          description: "Whether this is the recommended/default option."
                        }
                      },
                      required: ["label", "value", "recommended"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["question", "options"],
                additionalProperties: false
              }
            }
          },
          required: ["questions"],
          additionalProperties: false
        }
      }
    ];
    requestBody.tool_choice = "auto";
  }

  return requestBody;
}

function buildDomPrompt(request: OpenAIWidgetRequest): string {
  const snapshot = request.domSnapshot;
  const navigationContext = request.navigationContext
    ? stringifyForPrompt(request.navigationContext, DOM_PROMPT_LIMITS.navigationContext)
    : "{}";
  const guidanceContext = request.guidanceContext
    ? stringifyForPrompt(request.guidanceContext, DOM_PROMPT_LIMITS.guidanceContext)
    : "{}";
  const guidanceStep =
    typeof request.guidanceContext?.step === "number" && Number.isFinite(request.guidanceContext.step)
      ? request.guidanceContext.step
      : 0;
  const guidancePhase = request.guidanceContext
    ? guidanceStep > 0
      ? `continuation step ${guidanceStep}; do not call it first`
      : "initial guidance step"
    : "none";

  return `current endpoint: ${snapshot.route}
current route: ${snapshot.route}

viewport: ${snapshot.viewportWidth}x${snapshot.viewportHeight}
document title: ${snapshot.title ?? snapshot.pageMeta?.title ?? ""}

visitor request transcript: ${request.userPrompt}

navigation continuation context:
${navigationContext}

multi-step guidance context:
${guidanceContext}

multi-step guidance phase: ${guidancePhase}

decision rules:
1. use only the current visible element index, page meta, and cleaned DOM tree below. this is the current rendered view, not a full site map. previous DOM snapshots in the conversation are stale. do not use route documentation and do not invent routes.
2. every element has an id like u12 or c12. copy one of those ids exactly when pointing.
3. the page action map and visible element index are the most reliable sources for currently visible controls because they are collected independently of the pruned DOM tree. prefer their ids for buttons, links, inputs, menu items, tabs, switches, and other actionable controls.
4. elements include parent/child structure. child nodes such as img/svg can explain the parent button, so inspect children before deciding.
5. for task questions, first search the visible element index and DOM tree for explicit controls that match the requested intent, including labels in any language, icons, aria labels, class/id tokens, and nearby parent/child context.
6. for move/reorder/sort/position requests, prefer explicit controls such as move left/right/up/down, previous/next, reorder, sort, or menu/settings controls for that item. recommend drag/drop only when the DOM explicitly exposes draggable, aria-grabbed, dropzone, sortable, drag, or drop metadata.
7. hidden or closed surfaces are not part of the active DOM. if a requested control, answer, or item is not listed in the current DOM, do not pretend it is visible or already open.
8. when the requested final item is not currently listed, point to the best visible opener, such as a nav item, tab, menu button, settings button, or accordion label, and emit [NEED_FURTHER_ACTION:true]. after the user clicks it, you will get a fresh DOM and should continue from the new UI.
9. on a guidance continuation, use the originalPrompt and the new DOM to find the next step. if the requested final control is now visible/clickable, point to it and emit [NEED_FURTHER_ACTION:false]. if another opener is still needed, point to it and emit [NEED_FURTHER_ACTION:true].
10. if the best matching currently available element has visibility "above" or "below", emit [SCROLLTO:id:label] instead. [SCROLLTO] scrolls and points to the element in one step, so the spoken answer must not ask the visitor to scroll manually.
11. ignore hidden-state content if it appears due to legacy snapshots. the current view is determined by visible/partially_visible elements, the visible element index, and page meta.
12. for ordered targets such as first/second/last item, use DOM order and visual position to pick the matching item, then choose a relevant control inside that item before choosing page-level controls.
13. prefer an interactive ancestor for click/action questions when a child image/icon only describes that ancestor. prefer the exact interactive child when no actionable ancestor exists.
14. never answer "i only see/no visible control, so click/use/open x" with [POINT:none]. if x is in the DOM, point x and use [NEED_FURTHER_ACTION:true] when it opens the next step.
15. use [POINT:none] only for pure informational answers or when the DOM tree has no reasonable match and no plausible opener for the requested item/task.
16. never mention internal element ids to the visitor.
17. normal widget guidance cannot execute page actions. for settings, switches, checkboxes, forms, delete/save buttons, or similar controls, say "show you where to..." or "tap/click this..." instead of implying barkan will change the value.
18. tabs, headings, and section labels are context, but they can be required context switches for generic buttons. for "create/add/new x", if x has a visible unselected tab/selector and a different tab/selector is selected/current, choose x first with [NEED_FURTHER_ACTION:true]; after that click, choose the visible new/add/create/plus button.

directive examples:
- if the requested final action is hidden in a panel, and the current DOM has an item title plus an edit/options/settings icon for that item, answer like:
[POINTELEMENT:c12:edit][NEED_FURTHER_ACTION:true] click the item's edit icon, then i'll show you the next option.
- after that click, if the refreshed DOM shows the final button, answer like:
[POINTELEMENT:c34:move right][NEED_FURTHER_ACTION:false] click move right.
- bad answer pattern:
[POINT:none][NEED_FURTHER_ACTION:false] i only see the item title, so click its edit icon.
- corrected pattern:
[POINTELEMENT:the_edit_icon_id:edit][NEED_FURTHER_ACTION:true] click the item's edit icon, then i'll show you the next option.
- if the visitor asks to create a category-specific item and the generic new button is visible but a different category tab is selected on the initial guidance step, answer like:
[POINTELEMENT:c12:requested category][NEED_FURTHER_ACTION:true] open this category first, then i can show you new.
- on a guidance continuation where another opener is still needed, answer like:
[POINTELEMENT:c13:next section][NEED_FURTHER_ACTION:true] open this section next.
- after that click, if the refreshed DOM shows the same generic new button in the requested category, answer like:
[POINTELEMENT:c34:new][NEED_FURTHER_ACTION:false] click new.
- if the requested answer/control is inside any hidden section/panel/page and a visible nav/tab/button opens that surface, answer like:
[POINTELEMENT:c7:requested section][NEED_FURTHER_ACTION:true] open this section first, then i can show you the requested item.
- on a guidance continuation where the refreshed DOM shows another required intermediate section, answer like:
[POINTELEMENT:c8:security][NEED_FURTHER_ACTION:true] open security next.
- after that click, if the refreshed DOM shows the requested item below the viewport and the item itself must be opened, answer like:
[SCROLLTO:c21:requested item][NEED_FURTHER_ACTION:true] open this item.
- if the refreshed DOM shows the final requested button below the viewport and no further automatic step is needed, answer like:
[SCROLLTO:c22:requested button][NEED_FURTHER_ACTION:false] this is the button.
page meta:
${stringifyForPrompt(snapshot.pageMeta ?? {}, DOM_PROMPT_LIMITS.pageMeta)}

scroll surfaces:
${stringifyForPrompt(snapshot.scrollSurfaces, DOM_PROMPT_LIMITS.scrollSurfaces)}

page action map:
this is a compact, task-oriented map of visible controls with context, duplicate-label groups, forms, and active surfaces. use likelyTargets first to disambiguate repeated labels like settings, people, edit, add, create, save, and icon-only buttons.
${stringifyForPrompt(buildPageActionMap(snapshot, request.userPrompt), DOM_PROMPT_LIMITS.actionMap)}

current visible element index:
this index is collected independently from the cleaned DOM tree; prefer these ids for visible controls and current page context.
${stringifyForPrompt(buildVisibleInteractiveElementIndex(snapshot), DOM_PROMPT_LIMITS.visibleInteractiveElements)}

cleaned DOM tree:
${stringifyForPrompt(buildPromptDomTree(snapshot.elements), DOM_PROMPT_LIMITS.elements)}`;
}

export function buildOpenAIEndpointUrl(): string {
  return "https://api.openai.com/v1/responses";
}

function stringifyForPrompt(value: unknown, maxCharacters: number): string {
  return JSON.stringify(value).slice(0, maxCharacters);
}

type PromptDomElement = DomSnapshot["elements"][number];
type PromptUiFact = NonNullable<DomSnapshot["uiFacts"]>[number];
type PromptFormSummary = NonNullable<DomSnapshot["forms"]>[number];
type PromptContentBlock = NonNullable<DomSnapshot["contentBlocks"]>[number];
type PromptDomRelationship = NonNullable<DomSnapshot["relationships"]>[number];

interface PromptActionContext {
  relatedTextById: Map<string, string[]>;
}

interface PromptActionMapControl {
  id: string;
  label: string;
  kind?: string;
  role?: string;
  where?: string;
  container?: {
    kind: string;
    label?: string;
    index?: number;
  };
  href?: string | null;
  state?: Record<string, unknown>;
  hints?: string[];
  intents?: string[];
  scrollDirection?: "above" | "below" | "outside";
  source: "visibleIndex" | "offscreenIndex" | "cleanedTree";
}

interface PromptActionMap {
  activeContext: {
    route: string;
    title?: string;
    headings: string[];
    selectedNav: string[];
    activeDialog?: string;
    focusedFactId?: string;
  };
  primaryControls: PromptActionMapControl[];
  navigationControls: PromptActionMapControl[];
  offscreenControls: PromptActionMapControl[];
  likelyTargets: Array<Pick<PromptActionMapControl, "id" | "label" | "where" | "container" | "kind" | "role" | "intents" | "source" | "scrollDirection"> & { score: number; reasons: string[] }>;
  formControls: Array<{
    id: string;
    label: string;
    fields: PromptActionMapControl[];
    submits: PromptActionMapControl[];
    validationMessages?: string[];
  }>;
  duplicateLabels: Array<{
    label: string;
    controls: Array<Pick<PromptActionMapControl, "id" | "label" | "where" | "container" | "kind" | "role" | "intents" | "source">>;
  }>;
  surfaces: Array<{
    id: string;
    label?: string;
    role?: string;
    layout?: string;
    sampleLabels?: string[];
  }>;
}

function buildVisibleInteractiveElementIndex(snapshot: DomSnapshot): Array<Record<string, unknown>> {
  const indexedElements: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();

  for (const fact of snapshot.uiFacts ?? []) {
    if (!isCurrentPromptUiFact(fact)) {
      continue;
    }

    indexedElements.push(compactObject({
      id: fact.id,
      source: "visibleIndex",
      kind: fact.kind,
      role: fact.role,
      label: fact.label,
      text: fact.text,
      href: fact.href,
      context: fact.context,
      metadata: pickPromptUiFactMetadata(fact.metadata, { compact: true }),
      state: pickActionMapState(fact.state),
      surface: fact.surface
    }));
    seenIds.add(fact.id);
  }

  const visit = (children: DomSnapshot["elements"]) => {
    for (const element of children) {
      if (!seenIds.has(element.id) && isCurrentInteractiveElement(element)) {
        indexedElements.push(compactObject({
          id: element.id,
          source: "cleanedTree",
          tag: element.tag,
          role: element.role,
          label: element.label,
          text: element.text,
          attributes: pickPromptAttributes(element.attributes),
          state: pickActionMapState(element.state),
          visibility: element.visibility
        }));
        seenIds.add(element.id);
      }

      if (element.children?.length) {
        visit(element.children);
      }
    }
  };

  visit(snapshot.elements);
  return indexedElements;
}

function buildPageActionMap(snapshot: DomSnapshot, userPrompt: string): PromptActionMap {
  const actionContext = buildPromptActionContext(snapshot);
  const controls = buildPromptActionControls(snapshot, actionContext);
  const offscreenControls = buildPromptOffscreenActionControls(snapshot, actionContext);
  const controlById = new Map(controls.map((control) => [control.id, control]));
  const allControls = [...controls, ...offscreenControls];
  return {
    activeContext: {
      route: snapshot.route,
      ...(snapshot.title ?? snapshot.pageMeta?.title ? { title: snapshot.title ?? snapshot.pageMeta?.title } : {}),
      headings: (snapshot.pageMeta?.headings ?? []).slice(0, 12),
      selectedNav: (snapshot.pageMeta?.selectedNav ?? []).slice(0, 12),
      ...(snapshot.pageMeta?.activeDialog ? { activeDialog: snapshot.pageMeta.activeDialog } : {}),
      ...(snapshot.pageMeta?.focusedFactId ? { focusedFactId: snapshot.pageMeta.focusedFactId } : {})
    },
    primaryControls: controls.filter(isPrimaryActionMapControl).slice(0, 80),
    navigationControls: controls.filter(isNavigationActionMapControl).slice(0, 50),
    offscreenControls: offscreenControls.filter(isPrimaryActionMapControl).slice(0, 24),
    likelyTargets: buildLikelyActionTargets(userPrompt, allControls),
    formControls: buildPromptFormControls(snapshot.forms ?? [], controlById),
    duplicateLabels: buildDuplicateLabelGroups(allControls),
    surfaces: (snapshot.activeSurfaces ?? [])
      .slice(0, 8)
      .map((surface) => ({
        id: surface.id,
        ...(surface.label ? { label: surface.label } : {}),
        ...(surface.role ? { role: surface.role } : {}),
        layout: `${surface.layout.verticalBand}-${surface.layout.horizontalBand}`,
        sampleLabels: surface.sampleLabels?.slice(0, 8)
      }))
  };
}

function buildPromptOffscreenActionControls(snapshot: DomSnapshot, actionContext: PromptActionContext): PromptActionMapControl[] {
  return (snapshot.offscreenUiFacts ?? [])
    .filter((fact) => isActionablePromptUiFact(fact))
    .map((fact) => buildActionMapControlFromFact(fact, "offscreenIndex", actionContext));
}

function buildPromptActionControls(snapshot: DomSnapshot, actionContext: PromptActionContext): PromptActionMapControl[] {
  const controls: PromptActionMapControl[] = [];
  const seenIds = new Set<string>();
  for (const fact of snapshot.uiFacts ?? []) {
    if (!isCurrentPromptUiFact(fact) || !isActionablePromptUiFact(fact)) {
      continue;
    }

    controls.push(buildActionMapControlFromFact(fact, "visibleIndex", actionContext));
    seenIds.add(fact.id);
  }

  const visit = (children: DomSnapshot["elements"], ancestors: PromptDomElement[]) => {
    for (const element of children) {
      if (!seenIds.has(element.id) && isCurrentInteractiveElement(element)) {
        controls.push(buildActionMapControlFromDomElement(element, ancestors));
        seenIds.add(element.id);
      }

      if (element.children?.length) {
        visit(element.children, [...ancestors, element]);
      }
    }
  };
  visit(snapshot.elements, []);

  return controls;
}

function buildActionMapControlFromFact(
  fact: PromptUiFact,
  source: "visibleIndex" | "offscreenIndex",
  actionContext: PromptActionContext
): PromptActionMapControl {
  const relatedText = actionContext.relatedTextById.get(fact.id) ?? [];
  const hints = buildActionMapHints({
    label: fact.label,
    text: fact.text,
    role: fact.role,
    kind: fact.kind,
    metadata: fact.metadata,
    relatedText
  });
  return compactObject({
    id: fact.id,
    label: fact.label,
    kind: fact.kind,
    role: fact.role,
    where: buildActionMapWhere(fact, relatedText),
    container: pickActionMapContainer(fact.metadata),
    href: fact.href,
    state: pickActionMapState(fact.state),
    hints,
    intents: buildActionMapIntentAliases([
      fact.label,
      fact.text,
      fact.context,
      fact.href,
      flattenPromptMetadataText(fact.metadata),
      ...relatedText
    ].filter(Boolean).join(" ")),
    scrollDirection: source === "offscreenIndex" ? getScrollDirectionFromRect(fact.rect) : undefined,
    source
  });
}

function getScrollDirectionFromRect(rect: PromptUiFact["rect"]): "above" | "below" | "outside" {
  if (rect.y < 0) {
    return "above";
  }
  return "below";
}

function buildActionMapControlFromDomElement(element: PromptDomElement, ancestors: PromptDomElement[]): PromptActionMapControl {
  const where = buildDomAncestorContext(ancestors);
  const hints = buildActionMapHints({
    label: element.label,
    text: element.text,
    role: element.role,
    kind: element.tag,
    attributes: element.attributes
  });
  return compactObject({
    id: element.id,
    label: element.label || element.text || element.attributes?.["aria-label"] || element.attributes?.title || element.tag,
    kind: element.tag,
    role: element.role,
    where,
    href: element.attributes?.href,
    state: pickActionMapState(element.state),
    hints,
    intents: buildActionMapIntentAliases([
      element.label,
      element.text,
      element.role,
      element.tag,
      ...(Object.values(element.attributes ?? {}))
    ].filter(Boolean).join(" ")),
    source: "cleanedTree" as const
  });
}

function buildActionMapWhere(fact: PromptUiFact, relatedText: string[] = []): string | undefined {
  const container = fact.metadata?.container;
  const containerLabel = container?.label
    ? `${container.kind}${container.index ? ` ${container.index}` : ""}: ${container.label}`
    : container?.index
      ? `${container.kind} ${container.index}`
      : undefined;
  const parts = uniqueStrings(
    [fact.context, containerLabel, ...relatedText.map((value) => `nearby: ${value}`)].filter((value): value is string => Boolean(value)),
    6
  );
  return parts.length > 0 ? parts.join(" > ") : undefined;
}

function pickActionMapContainer(metadata: PromptUiFact["metadata"]): PromptActionMapControl["container"] | undefined {
  const container = metadata?.container;
  if (!container) {
    return undefined;
  }

  return compactObject({
    kind: container.kind,
    label: container.label,
    index: container.index
  });
}

function buildDomAncestorContext(ancestors: PromptDomElement[]): string | undefined {
  const labels = uniqueStrings(
    ancestors
      .slice(-5)
      .flatMap((ancestor) => [ancestor.label, ancestor.text])
      .filter((value): value is string => Boolean(value))
      .filter((value) => value.length <= 160),
    4
  );
  return labels.length > 0 ? labels.join(" > ") : undefined;
}

function buildPromptActionContext(snapshot: DomSnapshot): PromptActionContext {
  const factById = new Map<string, PromptUiFact>();
  const relatedTextById = new Map<string, string[]>();
  for (const fact of [...(snapshot.uiFacts ?? []), ...(snapshot.offscreenUiFacts ?? [])]) {
    factById.set(fact.id, fact);
  }

  const addRelatedText = (id: string, ...values: Array<string | undefined>) => {
    const normalized = uniqueStrings([...(relatedTextById.get(id) ?? []), ...values.filter((value): value is string => Boolean(value))], 5);
    if (normalized.length > 0) {
      relatedTextById.set(id, normalized);
    }
  };

  for (const form of (snapshot.forms ?? []).slice(0, 8)) {
    for (const id of [...form.fieldIds, ...form.submitIds]) {
      addRelatedText(id, form.label, ...form.validationMessages.slice(0, 2));
    }
  }

  for (const block of (snapshot.contentBlocks ?? []).slice(0, 14)) {
    const blockContext = summarizePromptContentBlock(block);
    if (!blockContext) {
      continue;
    }

    for (const id of block.nearbyFactIds.slice(0, 12)) {
      addRelatedText(id, blockContext);
    }
  }

  for (const relationship of (snapshot.relationships ?? []).slice(0, 80)) {
    applyPromptRelationshipContext(relationship, factById, addRelatedText);
  }

  return { relatedTextById };
}

function summarizePromptContentBlock(block: PromptContentBlock): string {
  return uniqueStrings([block.heading, block.text].filter((value): value is string => Boolean(value)), 2)
    .join(" ")
    .slice(0, 220);
}

function applyPromptRelationshipContext(
  relationship: PromptDomRelationship,
  factById: Map<string, PromptUiFact>,
  addRelatedText: (id: string, ...values: Array<string | undefined>) => void
) {
  const source = factById.get(relationship.from);
  const target = factById.get(relationship.to);

  if (relationship.kind === "label_for") {
    addRelatedText(relationship.to, relationship.label, source?.label, source?.text);
    return;
  }

  if (relationship.kind === "described_by" || relationship.kind === "controls" || relationship.kind === "owns") {
    addRelatedText(relationship.from, relationship.label, target?.label, target?.text, target?.context);
    return;
  }

  if (relationship.kind === "form_field" || relationship.kind === "form_submit") {
    addRelatedText(relationship.to, relationship.label);
  }
}

function buildActionMapHints(input: {
  label?: string;
  text?: string;
  role?: string;
  kind?: string;
  metadata?: PromptUiFact["metadata"];
  attributes?: PromptDomElement["attributes"];
  relatedText?: string[];
}): string[] | undefined {
  const values = [
    input.role,
    input.kind,
    input.metadata?.iconName,
    input.metadata?.domId,
    input.metadata?.name,
    input.metadata?.type,
    input.metadata?.testId,
    input.metadata?.container?.kind,
    input.metadata?.container?.label,
    input.metadata?.container?.role,
    input.metadata?.container?.index ? String(input.metadata.container.index) : undefined,
    ...(input.metadata?.classTokens ?? []).slice(0, 4),
    ...Object.entries(input.metadata?.data ?? {}).slice(0, 4).flatMap(([key, value]) => [key, value]),
    input.attributes?.id,
    input.attributes?.class,
    input.attributes?.icon,
    input.attributes?.src,
    input.attributes?.type,
    input.attributes?.name,
    input.attributes?.["aria-label"],
    ...(input.relatedText ?? [])
  ];
  const aliases = buildActionMapIntentAliases([
    input.label,
    input.text,
    ...values.filter((value): value is string => Boolean(value))
  ].join(" "));
  const normalized = uniqueStrings(
    [
      ...(aliases ?? []),
      ...values
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => tokenizeForSearch(value).slice(0, 4))
    ],
    10
  );
  return normalized.length > 0 ? normalized : undefined;
}

function buildActionMapIntentAliases(text: string, options: { query?: boolean } = {}): string[] | undefined {
  const normalized = normalizePromptText(text);
  if (!normalized) {
    return undefined;
  }

  const aliases: string[] = [];
  const add = (...values: string[]) => {
    for (const value of values) {
      if (!aliases.includes(value)) {
        aliases.push(value);
      }
    }
  };

  if (/\b(people|person|users?|members?|team|staff|collaborators?|teammates?)\b/.test(normalized)) {
    add("people", "users", "members", "team", "invite", "access");
  }
  if (/\bpoeple\b/.test(normalized)) {
    add("people", "users", "members", "team");
  }
  if (/\b(invite|invitation|invitations|add user|add member)\b/.test(normalized)) {
    add("invite", "people", "users", "members", "team");
  }
  if (/\b(api|keys?|tokens?|credentials?|secrets?|private keys?|access keys?)\b/.test(normalized)) {
    add("api", "key", "token", "credential", "secret", "access");
  }
  if (/\b(billing|invoice|invoices|payment|payments|subscription|subscriptions|plan|plans|credits?|spend|usage)\b/.test(normalized)) {
    add("billing", "invoice", "payment", "subscription", "plan", "credits", "usage");
  }
  if (/\b(docs?|documentation|help|support|guide|guides|cookbook|learn)\b/.test(normalized)) {
    add("docs", "documentation", "help", "support", "guide");
  }
  if (/\b(logs?|activity|audit|events?|history|traces?)\b/.test(normalized)) {
    add("logs", "activity", "audit", "events", "history");
  }
  if (/\b(storage|files?|uploads?|media|assets?|documents?)\b/.test(normalized)) {
    add("storage", "files", "uploads", "media", "assets");
  }
  if (/\b(webhooks?|integrations?|connectors?|apps?|oauth|api clients?)\b/.test(normalized)) {
    add("webhook", "integration", "connector", "app", "oauth");
  }
  if (/\b(projects?|workspaces?|organizations?|organisation|orgs?|accounts?)\b/.test(normalized)) {
    add("project", "workspace", "organization", "account");
  }
  if (/\b(pull requests?|prs?|merge requests?|reviews?)\b/.test(normalized)) {
    add("pull requests", "prs", "pr", "merge request", "review");
  }
  if (/\b(repos?|repositories|repository|code|branches?|commits?)\b/.test(normalized)) {
    add("repository", "repo", "code", "branch", "commit");
  }
  if (/\b(issues?|tickets?|bugs?|tasks?|incidents?)\b/.test(normalized)) {
    add("issue", "ticket", "bug", "task", "incident");
  }
  if (/\b(compose|new email|write email|send email|drafts?)\b/.test(normalized)) {
    add("compose", "draft", "mail", "email", "message");
  }
  if (/\b(mail|email|emails|messages?|inbox|sent|spam|archive)\b/.test(normalized)) {
    add("mail", "email", "message", "sent", "archive");
    if (options.query || /\binbox\b/.test(normalized)) {
      add("inbox");
    }
  }
  if (/\b(cart|bag|basket|checkout|purchase|buy|order summary|payment)\b/.test(normalized)) {
    add("cart", "bag", "basket", "checkout", "purchase", "buy", "payment", "order summary");
  }
  if (/\b(orders?|shipments?|shipping|delivery|deliveries|fulfillment|tracking|returns?)\b/.test(normalized)) {
    add("order", "shipment", "shipping", "delivery", "fulfillment", "tracking", "return");
  }
  if (/\b(log in|login|sign in|signin|sign up|signup|register|registration|logout|log out|sign out)\b/.test(normalized)) {
    add("login", "log in", "sign in", "signin", "account", "register", "sign up", "logout", "sign out");
  }
  if (/\b(profile|avatar|account menu|user menu|personal|me)\b/.test(normalized)) {
    add("profile", "avatar", "account", "user", "personal");
  }
  if (/\b(notifications?|alerts?|bell|announcements?)\b/.test(normalized)) {
    add("notification", "alert", "bell", "announcement");
  }
  if (/\b(security|sso|auth|authentication|roles?|permissions?|access|policies?)\b/.test(normalized)) {
    add("security", "auth", "role", "permission", "access");
  }
  if (/\b(models?|playground|chat|assistants?|agents?|evaluations?|evals?|prompts?)\b/.test(normalized)) {
    add("model", "playground", "chat", "assistant", "agent", "evaluation", "prompt");
  }
  if (/\b(create|new|add|plus|start|generate)\b/.test(normalized)) {
    add("create", "new", "add", "generate");
  }
  if (/\b(settings?|preferences?|manage|configure|configuration|admin)\b/.test(normalized)) {
    add("settings", "manage", "configure", "admin");
  }
  if (/\b(search|find|filter|sort|query)\b/.test(normalized)) {
    add("search", "find", "filter", "sort");
  }

  return aliases.length > 0 ? aliases.slice(0, 16) : undefined;
}

function flattenPromptMetadataText(metadata: PromptUiFact["metadata"]): string {
  if (!metadata) {
    return "";
  }

  return [
    metadata.tagName,
    metadata.domId,
    metadata.name,
    metadata.type,
    metadata.value,
    metadata.testId,
    metadata.iconName,
    metadata.container?.kind,
    metadata.container?.label,
    metadata.container?.role,
    metadata.container?.index ? String(metadata.container.index) : undefined,
    ...(metadata.classTokens ?? []),
    ...Object.entries(metadata.data ?? {}).flatMap(([key, value]) => [key, value]),
    ...Object.entries(metadata.aria ?? {}).flatMap(([key, value]) => [key, String(value)])
  ]
    .filter(Boolean)
    .join(" ");
}

function pickActionMapState(state: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!state) {
    return undefined;
  }

  const picked: Record<string, unknown> = {};
  for (const key of ["disabled", "selected", "expanded", "checked", "required", "focused", "visible"] as const) {
    const value = state[key];
    if (value !== undefined && value !== false) {
      picked[key] = value;
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function isPrimaryActionMapControl(control: PromptActionMapControl): boolean {
  const text = normalizePromptText([control.label, control.where, ...(control.hints ?? [])].join(" "));
  return (
    isButtonLikeActionMapControl(control) ||
    /\b(create|new|add|invite|member|people|save|submit|continue|next|done|edit|delete|remove|settings|manage|open|sign|log|checkout|buy|cart|search|filter|sort|upload|download)\b/.test(text)
  );
}

function isNavigationActionMapControl(control: PromptActionMapControl): boolean {
  const text = normalizePromptText([control.label, control.where, control.href ?? "", ...(control.hints ?? [])].join(" "));
  return (
    control.kind === "link" ||
    control.role === "tab" ||
    control.role === "menuitem" ||
    Boolean(control.href) ||
    /\b(nav|tab|sidebar|menu|breadcrumb|settings|billing|people|member|organization|project|profile|account|dashboard|home)\b/.test(text)
  );
}

function isButtonLikeActionMapControl(control: PromptActionMapControl): boolean {
  return control.kind === "button" || control.role === "button" || control.kind === "input" || control.kind === "menu";
}

function buildLikelyActionTargets(userPrompt: string, controls: PromptActionMapControl[]): PromptActionMap["likelyTargets"] {
  const promptTokens = tokenizeForSearch(userPrompt);
  const promptAliases = buildActionMapIntentAliases(userPrompt, { query: true }) ?? [];
  if (promptTokens.length === 0 && promptAliases.length === 0) {
    return [];
  }

  return controls
    .map((control) => ({ control, ...scoreLikelyActionTarget(control, promptTokens, promptAliases, userPrompt) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftSourceScore = getActionTargetSourceRank(left.control);
      const rightSourceScore = getActionTargetSourceRank(right.control);
      if (rightSourceScore !== leftSourceScore) {
        return rightSourceScore - leftSourceScore;
      }

      return 0;
    })
    .slice(0, 12)
    .map(({ control, score, reasons }) =>
      compactObject({
        id: control.id,
        label: control.label,
        where: control.where,
        container: control.container,
        kind: control.kind,
        role: control.role,
        intents: control.intents,
        source: control.source,
        scrollDirection: control.scrollDirection,
        score,
        reasons: reasons.slice(0, 5)
      })
    );
}

function scoreLikelyActionTarget(
  control: PromptActionMapControl,
  promptTokens: string[],
  promptAliases: string[],
  userPrompt: string
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const labelText = normalizePromptText(control.label);
  const whereText = normalizePromptText([control.where, control.container?.label].filter(Boolean).join(" "));
  const hintText = normalizePromptText((control.hints ?? []).join(" "));
  const intentText = normalizePromptText((control.intents ?? []).join(" "));
  const hrefText = normalizePromptText(control.href ?? "");
  const allText = normalizePromptText([control.label, control.where, control.container?.label, ...(control.hints ?? []), ...(control.intents ?? []), control.href ?? ""].join(" "));
  const normalizedPrompt = normalizePromptText(userPrompt);

  if (normalizedPrompt.length > 3 && allText.includes(normalizedPrompt)) {
    score += 18;
    reasons.push("full phrase");
  }

  for (const token of promptTokens) {
    if (labelText === token || labelText.split(" ").includes(token)) {
      score += 12;
      reasons.push(`label:${token}`);
    } else if (labelText.includes(token)) {
      score += 9;
      reasons.push(`label:${token}`);
    } else if (whereText.includes(token)) {
      score += 8;
      reasons.push(`context:${token}`);
    } else if (intentText.includes(token)) {
      score += 7;
      reasons.push(`intent:${token}`);
    } else if (hintText.includes(token)) {
      score += 5;
      reasons.push(`hint:${token}`);
    } else if (hrefText.includes(token)) {
      score += 4;
      reasons.push(`href:${token}`);
    }
  }

  for (const alias of promptAliases) {
    const normalizedAlias = normalizePromptText(alias);
    if (!normalizedAlias) {
      continue;
    }

    if (intentText.includes(normalizedAlias)) {
      score += 8;
      reasons.push(`alias:${normalizedAlias}`);
    } else if (labelText.includes(normalizedAlias) || whereText.includes(normalizedAlias) || hintText.includes(normalizedAlias)) {
      score += 5;
      reasons.push(`alias:${normalizedAlias}`);
    }
  }

  if (isButtonLikeActionMapControl(control)) {
    score += 2;
  }
  if (isNavigationActionMapControl(control)) {
    score += 1;
  }
  if (control.source === "offscreenIndex") {
    score -= 4;
  }
  if (control.state?.disabled === true) {
    score -= 20;
    reasons.push("disabled");
  }

  return {
    score: Math.max(0, score),
    reasons: uniqueStrings(reasons, 6)
  };
}

function getActionTargetSourceRank(control: PromptActionMapControl): number {
  if (control.source === "visibleIndex") {
    return 3;
  }
  if (control.source === "cleanedTree") {
    return 2;
  }
  return 1;
}

function buildPromptFormControls(forms: PromptFormSummary[], controlById: Map<string, PromptActionMapControl>) {
  return forms.slice(0, 10).map((form) => ({
    id: form.id,
    label: form.label,
    fields: form.fieldIds.map((id) => controlById.get(id)).filter((control): control is PromptActionMapControl => Boolean(control)).slice(0, 14),
    submits: form.submitIds.map((id) => controlById.get(id)).filter((control): control is PromptActionMapControl => Boolean(control)).slice(0, 8),
    ...(form.validationMessages.length > 0 ? { validationMessages: form.validationMessages.slice(0, 3) } : {})
  }));
}

function buildDuplicateLabelGroups(controls: PromptActionMapControl[]) {
  const groups = new Map<string, PromptActionMapControl[]>();
  for (const control of controls) {
    const key = normalizePromptText(control.label);
    if (!key || key.length < 3) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), control]);
  }

  return Array.from(groups.entries())
    .filter(([, groupControls]) => groupControls.length > 1)
    .slice(0, 16)
    .map(([label, groupControls]) => ({
      label,
      controls: groupControls
        .slice(0, 8)
        .map((control) => compactObject({
          id: control.id,
          label: control.label,
          where: control.where,
          container: control.container,
          kind: control.kind,
          role: control.role,
          intents: control.intents,
          source: control.source
        }))
    }));
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => {
    if (entryValue === undefined || entryValue === null) {
      return false;
    }
    if (Array.isArray(entryValue) && entryValue.length === 0) {
      return false;
    }
    if (typeof entryValue === "object" && !Array.isArray(entryValue) && Object.keys(entryValue).length === 0) {
      return false;
    }
    return true;
  })) as T;
}

function buildPromptDomTree(elements: PromptDomElement[]): Array<Record<string, unknown>> {
  return elements.map((element) => buildPromptDomElement(element));
}

function buildPromptDomElement(element: PromptDomElement): Record<string, unknown> {
  return compactObject({
    id: element.id,
    tag: element.tag,
    role: element.role,
    label: element.label,
    text: element.text,
    attributes: pickPromptAttributes(element.attributes),
    visibility: element.visibility === "visible" ? undefined : element.visibility,
    interactive: element.interactive ? true : undefined,
    state: pickActionMapState(element.state),
    children: element.children?.length ? buildPromptDomTree(element.children).slice(0, 28) : undefined
  });
}

function uniqueStrings(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    const key = normalizePromptText(cleaned);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cleaned.slice(0, 180));
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function normalizePromptText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForSearch(text: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "can",
    "click",
    "find",
    "for",
    "how",
    "i",
    "is",
    "it",
    "me",
    "of",
    "on",
    "please",
    "show",
    "the",
    "this",
    "to",
    "where",
    "you"
  ]);

  return normalizePromptText(text)
    .split(" ")
    .map((token) => singularizeToken(token))
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 16);
}

function singularizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

function isCurrentPromptUiFact(fact: PromptUiFact): boolean {
  if (!fact.state.visible || fact.rect.width <= 0 || fact.rect.height <= 0) {
    return false;
  }

  return (
    isActionablePromptUiFact(fact) ||
    fact.kind === "heading" ||
    fact.kind === "modal" ||
    fact.kind === "table" ||
    fact.state.selected ||
    Boolean(fact.metadata?.aria?.current)
  );
}

function isActionablePromptUiFact(fact: Pick<PromptUiFact, "kind">): boolean {
  return fact.kind === "button" || fact.kind === "link" || fact.kind === "input" || fact.kind === "menu";
}

function isCurrentInteractiveElement(element: PromptDomElement): boolean {
  return (
    element.interactive === true &&
    element.state?.ancestorHidden !== true &&
    (element.visibility === "visible" || element.visibility === "partially_visible") &&
    element.rect.width > 0 &&
    element.rect.height > 0
  );
}

function pickPromptAttributes(attributes: PromptDomElement["attributes"]): Record<string, string> | undefined {
  if (!attributes) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const key of ["id", "class", "role", "aria-label", "alt", "title", "name", "type", "icon", "src"]) {
    const value = attributes[key];
    if (value) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function pickPromptUiFactMetadata(
  metadata: PromptUiFact["metadata"],
  options: { compact?: boolean } = {}
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const key of ["tagName", "domId", "name", "type", "testId", "iconName", "value"] as const) {
    const value = metadata[key];
    if (value) {
      result[key] = value;
    }
  }

  if (metadata.classTokens?.length) {
    result.classTokens = metadata.classTokens.slice(0, options.compact ? 3 : 6);
  }

  const container = pickActionMapContainer(metadata);
  if (container) {
    result.container = container;
  }

  if (metadata.data && Object.keys(metadata.data).length > 0) {
    result.data = Object.fromEntries(Object.entries(metadata.data).slice(0, options.compact ? 3 : 12));
  }

  if (metadata.aria && Object.keys(metadata.aria).length > 0) {
    result.aria = Object.fromEntries(Object.entries(metadata.aria).slice(0, options.compact ? 3 : 12));
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
