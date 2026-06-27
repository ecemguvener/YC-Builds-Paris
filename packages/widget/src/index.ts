import {
  SequentialAsyncQueue,
  getRuntimeRoute,
  placeAgentNearTarget,
  type ViewportPoint,
  type ViewportSize,
  type VoiceState
} from "./interaction";
import { pointBoxToViewportCenter, tryExtractSpeakableText } from "./point-tags";
import { readPostSseStream, type WidgetSseEvent } from "./sse";
import { SpokenResponseStreamingChunker } from "./spoken-chunker";
import {
  appendGoalConversationEntry,
  buildActionRunSummary,
  buildHttpBatchResultPayload,
  buildResultHoldProgressLabel,
  createGoalRunStateForUserMessage,
  executeBrowserHttpCall,
  executeBrowserHttpCallBatch,
  formatActionProgressLabelForDisplay,
  readHttpCallsFromActionResponse,
  summarizeHttpCallResult,
  type WidgetActionRunSummary,
  type WidgetActionApiResponse,
  type WidgetActionChoice,
  type WidgetActionQuestion,
  type WidgetGoalConversationEntry
} from "./actions";
import {
  collectComposedDomCandidates,
  elementContainsDeep,
  findElementByIdInAccessibleScope,
  findPreferredPointableAncestor,
  getComposedParentElement,
  getDomChildElements,
  getElementViewportRect,
  isElementOfType,
  isHtmlElement,
  iterateComposedHtmlDescendants
} from "./dom-compose";
import { isDomSnapshotProbablyStale as isSnapshotStaleForRouteContent } from "./dom-staleness";

interface WidgetConfig {
  apiBaseUrl: string;
  domainWarning: boolean;
  site: {
    name: string;
    publicSiteKey: string;
    domain: string;
    chatTheme?: WidgetChatTheme;
  };
}

type WidgetChatTheme = "system" | "light" | "dark";

interface TtsTokenConfig {
  token: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
}

type MicrophoneRecoveryReason =
  | "missing transcriber"
  | "microphone stream ended"
  | "microphone track ended"
  | "transcriber closed"
  | "transcriber health check"
  | "unmute";

type ChoicePromptMode = "action" | "question";

const MICROPHONE_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
};

const WAVEFORM_BASE_SCALE = 0.42;
const WAVEFORM_BAR_WEIGHTS = [0.52, 0.72, 0.58, 0.9, 1, 0.86, 0.76, 0.6, 0.5];
const REALTIME_STT_SAMPLE_RATE = 16000;
const VOICE_ACTIVITY_LEVEL_THRESHOLD = 0.08;
const SILENCE_LEVEL_THRESHOLD = 0.02;
const RECENT_VOICE_ACTIVITY_MS = 700;
const FALLBACK_PARTIAL_COMMIT_MS = 1300;
const FALLBACK_COMMIT_CHECK_MS = 350;
const VAD_NUDGE_SILENCE_MS = 80;
const FORCED_COMMIT_SILENCE_MS = 120;
const CHAT_SIDEBAR_WIDTH_PX = 430;
const CHAT_SIDEBAR_MIN_WIDTH_PX = 360;
const CHAT_SIDEBAR_MAX_WIDTH_PX = 680;
const CHAT_SIDEBAR_PAGE_MIN_WIDTH_PX = 320;
const CHAT_SIDEBAR_TRANSITION_MS = 420;
const CHAT_SIDEBAR_TRANSITION = `margin-right ${CHAT_SIDEBAR_TRANSITION_MS}ms cubic-bezier(.22, 1, .36, 1)`;
const WIDGET_BUILD_ID = "dom-settle-latency-2026-05-28";
const AUTOMATION_PRE_AUTH_SEQUENCE_MS = 7_000;
const AUTOMATION_POST_AUTH_SEQUENCE_MS = 3_000;
const VISIBLE_UI_FACT_LIMIT = 200;
const OFFSCREEN_UI_FACT_LIMIT = 24;
const PRIMARY_CONTROL_UI_FACT_FALLBACK_LIMIT = 120;
const PRIMARY_CONTROL_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "option",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='option']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']"
].join(",");
const DOM_TREE_MAX_NODES = 700;
const DOM_TREE_MAX_ROOT_ELEMENTS = 140;
const DOM_TREE_MAX_DEPTH = 10;
const DOM_TREE_MAX_CHILDREN = 72;
const DOM_TREE_MAX_DEPTH_PRIORITY_DESCENDANTS = 48;
const DOM_TREE_SUPPLEMENTAL_TARGET_LIMIT = 96;
const DOM_CAPTURE_CANDIDATE_LIMIT = 2500;
const DOM_CAPTURE_ACTIVE_SURFACE_CANDIDATE_LIMIT = 900;
const DOM_CAPTURE_OPTIONAL_CONTEXT_BUDGET_MS = 420;
const DOM_CAPTURE_IMPORTANT_OPTIONAL_CONTEXT_BUDGET_MS = 700;
const DOM_TREE_BUILD_BUDGET_MS = 520;
const DOM_CAPTURE_FONT_SETTLE_TIMEOUT_MS = 32;
const DOM_CAPTURE_ROUTE_SETTLE_TIMEOUT_MS = 700;
const DOM_CAPTURE_BOOTING_SETTLE_TIMEOUT_MS = 1400;
const DOM_CAPTURE_BOOTING_READINESS_MAX_WAIT_MS = 850;
const DOM_CAPTURE_ROUTE_SETTLE_INTERVAL_MS = 25;
const DOM_CAPTURE_ROUTE_SETTLE_MIN_MS = 220;
const DOM_CAPTURE_BOOTING_SETTLE_MIN_MS = 180;
const DOM_CAPTURE_ROUTE_MISMATCH_GRACE_MS = 120;
const DOM_CAPTURE_MUTATION_QUIET_MS = 150;
const DOM_CAPTURE_BOOTING_MUTATION_QUIET_MS = 140;
const DOM_CAPTURE_ROUTE_SETTLE_STABLE_SAMPLES = 2;
const DOM_CAPTURE_BOOTING_STABLE_SAMPLES = 2;
const DOM_CAPTURE_STALE_RETRY_DELAY_MS = 140;
const DOM_CAPTURE_MAX_STALE_RETRIES = 3;
const GUIDANCE_CLICK_DOM_SETTLE_TIMEOUT_MS = 950;
const GUIDANCE_CLICK_DOM_SETTLE_MIN_MS = 140;
const GUIDANCE_CLICK_DOM_SETTLE_QUIET_MS = 120;
const GUIDANCE_CLICK_DOM_FIRST_CHANGE_WAIT_MS = 420;
const GUIDANCE_MAX_STEPS = 12;
const SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

interface BarkanDebugState {
  widgetBuildId?: string;
  lastTranscript?: string;
  lastIgnoredTranscript?: string;
  lastMicRecovery?: MicrophoneRecoveryReason;
  lastError?: string;
  lastEndReason?: string;
  stateHistory?: Array<{ state: VoiceState; message: string; isCallActive: boolean; at: number }>;
  events?: Array<{ name: string; detail?: string; at: number }>;
  lastRawResponse?: string;
  lastSpokenResponse?: string;
  lastPointBox?: unknown;
  lastQuestion?: { questions: Array<{ question: string; choices: string[] }> };
  lastGuidanceInference?: unknown;
  lastDomSnapshot?: unknown;
  lastTimings?: Record<string, number>;
  sentPreviousOpenAIResponseId?: string | null;
  pendingOpenAIResponseId?: string;
  lastOpenAIResponseId?: string;
  latencyLogs?: BarkanLatencyLogEntry[];
}

interface BarkanLatencyLogEntry {
  label: string;
  elapsedMs: number;
  at: number;
  details?: Record<string, unknown>;
}

interface WidgetRequestDebugTimings {
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

type UiFactKind = "button" | "link" | "input" | "heading" | "modal" | "menu" | "table" | "text";

interface UiFact {
  id: string;
  kind: UiFactKind;
  role?: string;
  label: string;
  text?: string;
  href?: string | null;
  context?: string;
  metadata?: UiFactMetadata;
  state: {
    visible: boolean;
    disabled: boolean;
    selected: boolean;
    expanded: boolean;
    required: boolean;
  };
  rect: { x: number; y: number; width: number; height: number };
  surface?: {
    id: string;
    relation: "self" | "descendant";
  };
}

interface UiFactMetadata {
  tagName: string;
  domId?: string;
  name?: string;
  type?: string;
  value?: string;
  testId?: string;
  iconName?: string;
  classTokens?: string[];
  data?: Record<string, string>;
  container?: {
    kind: "row" | "card" | "listitem" | "section" | "form" | "group";
    label?: string;
    role?: string;
    index?: number;
  };
  aria?: {
    controls?: string;
    describedBy?: string;
    current?: string;
    hasPopup?: string;
    live?: string;
    pressed?: boolean;
    checked?: boolean | "mixed";
    invalid?: boolean;
  };
}

interface ScrollSurface {
  id: string;
  kind: "page" | "container";
  label: string;
  rect: { x: number; y: number; width: number; height: number };
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  canScrollUp: boolean;
  canScrollDown: boolean;
}

interface ActiveSurface {
  id: string;
  label?: string;
  role?: string;
  tagName: string;
  rect: { x: number; y: number; width: number; height: number };
  layout: {
    horizontalBand: "left" | "center" | "right" | "full" | "spans";
    verticalBand: "top" | "middle" | "bottom" | "full" | "spans";
    widthRatio: number;
    heightRatio: number;
    viewportAreaRatio: number;
  };
  stacking: {
    cssPosition: string;
    zIndex: number | null;
    hasBackdrop: boolean;
    containsFocus: boolean;
    pointerEvents: string;
  };
  factIds: string[];
  sampleLabels: string[];
}

interface DomSnapshotMarkers {
  selectedLabels: string[];
  visibleHeadings: string[];
  primaryActions: string[];
  collectionHints: string[];
  activeSurfaceLabels: string[];
  transientLabels: string[];
}

interface ContentBlock {
  id: string;
  heading?: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  nearbyFactIds: string[];
}

interface FormSummary {
  id: string;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
  fieldIds: string[];
  submitIds: string[];
  validationMessages: string[];
}

interface DomRelationship {
  kind: "label_for" | "described_by" | "controls" | "form_field" | "form_submit" | "owns";
  from: string;
  to: string;
  label?: string;
}

interface PageMeta {
  title?: string;
  route: string;
  headings: string[];
  landmarks: string[];
  selectedNav: string[];
  activeDialog?: string;
  focusedFactId?: string;
}

interface ResolvedPointTarget {
  x: number;
  y: number;
  elementId?: string;
  label?: string;
  source: "snapshot" | "live";
}

type DomElementVisibility = "visible" | "partially_visible" | "above" | "below" | "outside";

interface DomElementSnapshot {
  id: string;
  tag: string;
  role?: string;
  label?: string;
  text?: string;
  attributes?: Record<string, string>;
  state?: {
    disabled?: boolean;
    selected?: boolean;
    expanded?: boolean;
    checked?: boolean | "mixed";
    required?: boolean;
    focused?: boolean;
    hidden?: boolean;
    ancestorHidden?: boolean;
  };
  rect: { x: number; y: number; width: number; height: number };
  visibility: DomElementVisibility;
  interactive: boolean;
  children?: DomElementSnapshot[];
}

interface DomSnapshot {
  captureVersion: string;
  route: string;
  viewportWidth: number;
  viewportHeight: number;
  title?: string;
  elements: DomElementSnapshot[];
  uiFacts: UiFact[];
  offscreenUiFacts: UiFact[];
  scrollSurfaces: ScrollSurface[];
  activeSurfaces?: ActiveSurface[];
  markers?: DomSnapshotMarkers;
  contentBlocks?: ContentBlock[];
  forms?: FormSummary[];
  relationships?: DomRelationship[];
  pageMeta?: PageMeta;
}

interface DomPageContext {
  kind: "dom";
  snapshot: DomSnapshot;
  targetElements: Map<string, HTMLElement>;
  debugTimings?: WidgetRequestDebugTimings;
}

type PageContext = DomPageContext;

interface CommittedTurn {
  sessionId: number;
  transcript: string;
  historyTranscript?: string;
  previousResponseId?: string | null;
  questionToolCallId?: string;
  suppressFurtherQuestions?: boolean;
  scrollRetryCount: number;
  silentResponse?: boolean;
  answeredQuestions?: boolean;
  navigationContext?: NavigationContinuationContext;
  guidanceContext?: GuidanceContinuationContext;
}

interface ActionTurn {
  sessionId: number;
  userMessage?: string;
  selectedChoice?: WidgetActionChoice;
}

interface NavigationContinuationContext {
  originalPrompt: string;
  targetRoute: string;
  previousRoute: string;
  navigationCount: number;
}

interface GuidanceContinuationContext {
  originalPrompt: string;
  step: number;
  previousElementId?: string;
  previousElementLabel?: string;
  previousInstruction?: string;
}

interface PendingGuidanceClick {
  sessionId: number;
  elementId: string;
  label?: string;
  instruction: string;
  originalPrompt: string;
  step: number;
  silentResponse: boolean;
  cleanup: () => void;
}

interface PendingClarificationContext {
  originalPrompt: string;
  previousResponseId: string | null;
  toolCallId?: string;
}

interface PersistedCallState {
  version: 1;
  siteKey: string;
  savedAt: number;
  navigationContext: NavigationContinuationContext | null;
  lastOpenAIResponseId?: string | null;
  isMuted: boolean;
  textEntryMode: TextEntryMode;
}

interface ChatPanelMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  presentation?: "normal" | "thinking" | "thinking-static" | "authorization" | "action-summary";
  actionSummary?: WidgetActionRunSummary;
  clarificationDetails?: {
    entries: Array<{ question: string; answer: string }>;
  };
}

interface ChoicePrompt {
  prompt: string;
  choices: WidgetActionChoice[];
}

interface ChoiceAnswerState {
  selectedIndex: number;
  freeformValue: string;
}

interface PageResizeTargetRestore {
  element: HTMLElement;
  width: string;
  maxWidth: string;
  minWidth: string;
  computedRight: number | null;
  right: string;
  transition: string;
  boxSizing: string;
}

type TextEntryMode = "show" | "act" | "automation";
type ModePickerPlacement = "empty" | "composer";

const modePickerOptions: Array<{ mode: TextEntryMode; emptyLabel: string; composerLabel: string }> = [
  { mode: "show", emptyLabel: "Ask", composerLabel: "Show" },
  { mode: "act", emptyLabel: "Do", composerLabel: "Act" },
  { mode: "automation", emptyLabel: "Automate", composerLabel: "Automation" }
];

function isTextEntryMode(value: string): value is TextEntryMode {
  return value === "show" || value === "act" || value === "automation";
}

function getModePickerLabel(mode: TextEntryMode, placement: ModePickerPlacement): string {
  const option = modePickerOptions.find((modePickerOption) => modePickerOption.mode === mode);
  return placement === "empty" ? option?.emptyLabel ?? "Ask" : option?.composerLabel ?? "Show";
}

function getEmptyModeSuffix(mode: TextEntryMode): string {
  if (mode === "act") {
    return "anything with Barkan.";
  }

  if (mode === "automation") {
    return "with Barkan.";
  }

  return "Barkan anything.";
}

function hasPendingActionQuestion(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "pendingQuestion" in value &&
      (value as { pendingQuestion?: unknown }).pendingQuestion
  );
}

function shouldReduceMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

declare global {
  interface Window {
    __BARKAN_DEBUG__?: BarkanDebugState;
  }
}

class BarkanWidget {
  private readonly siteKey: string;
  private readonly scriptOrigin: string;
  private apiBaseUrl: string;
  private config: WidgetConfig | null = null;
  private readonly root: HTMLDivElement;
  private readonly launcherButton: HTMLButtonElement;
  private readonly callControl: HTMLDivElement;
  private readonly micButton: HTMLButtonElement;
  private readonly textQuestionForm: HTMLFormElement;
  private readonly textQuestionInput: HTMLTextAreaElement;
  private readonly textQuestionSendButton: HTMLButtonElement;
  private readonly actionChoiceContainer: HTMLDivElement;
  private readonly chatPanel: HTMLDivElement;
  private readonly chatResizeHandle: HTMLButtonElement;
  private readonly chatCloseButton: HTMLButtonElement;
  private readonly chatMessageList: HTMLUListElement;
  private readonly chatEmptyState: HTMLDivElement;
  private readonly chatEmptyModePicker: HTMLDivElement;
  private readonly chatEmptyModeButton: HTMLButtonElement;
  private readonly chatEmptyModeLabel: HTMLSpanElement;
  private readonly chatEmptyModeOptions: HTMLButtonElement[];
  private readonly chatEmptyModeSuffix: HTMLSpanElement;
  private readonly textQuestionModePicker: HTMLDivElement;
  private readonly textQuestionModeButton: HTMLButtonElement;
  private readonly textQuestionModeLabel: HTMLSpanElement;
  private readonly textQuestionModeOptions: HTMLButtonElement[];
  private readonly hangupButton: HTMLButtonElement;
  private readonly callStatus: HTMLSpanElement;
  private readonly agent: HTMLDivElement;
  private readonly agentPointer: HTMLDivElement;
  private readonly agentBubble: HTMLDivElement;
  private readonly waveformBars: HTMLSpanElement[];
  private lastWaveformLevel = 0;
  private waveformAnimationId: number | null = null;
  private waveformCurrentScales: number[] = [];
  private waveformTargetScales: number[] = [];
  private agentTarget: ViewportPoint | null = null;
  private lastMousePosition: ViewportPoint | null = null;
  private state: VoiceState = "idle";
  private hasShownMicConsent = false;
  private isCallActive = false;
  private isMuted = false;
  private isTextModeActive = false;
  private isLauncherBusy = false;
  private isChatCallBusy = false;
  private textEntryMode: TextEntryMode = "show";
  private preferredTextEntryMode: TextEntryMode = "show";
  private openModePicker: ModePickerPlacement | null = null;
  private isActionModeActive = false;
  private goalRunState: unknown = null;
  private choicePrompts: ChoicePrompt[] = [];
  private choiceAnswerStates: ChoiceAnswerState[] = [];
  private activeChoicePromptIndex = 0;
  private choicePromptMode: ChoicePromptMode | null = null;
  private goalConversationContext: WidgetGoalConversationEntry[] = [];
  private chatMessages: ChatPanelMessage[] = [];
  private isChatThinking = false;
  private chatThinkingText = "Thinking";
  private chatThinkingTargetText = "Thinking";
  private chatThinkingPreviousText: string | null = null;
  private isChatThinkingTransitioning = false;
  private chatThinkingTransitionTimer: number | null = null;
  private chatThinkingTransitionSequence = 0;
  private expandedChatActivityMessageIds = new Set<string>();
  private chatSidebarWidth = CHAT_SIDEBAR_WIDTH_PX;
  private isChatSidebarResizing = false;
  private pageResizeRestore: (() => void) | null = null;
  private pageResizeTargetRestores: PageResizeTargetRestore[] = [];
  private pageResizeCleanupTimer: number | null = null;
  private callSessionId = 0;
  private activeTranscriber: RealtimeTranscriber | null = null;
  private activeTts: RealtimeTtsPlayer | null = null;
  private activeHttpTts: HTMLAudioElement | null = null;
  private activeHttpTtsStopper: (() => void) | null = null;
  private primedTtsAudio: HTMLAudioElement | null = null;
  private primedInputAudioContext: AudioContext | null = null;
  private activeMicrophoneStream: MediaStream | null = null;
  private activeOpenAIAbortController: AbortController | null = null;
  private activeActionAbortController: AbortController | null = null;
  private isSpeechInterruptedByUser = false;
  private currentAssistantSpeech = "";
  private recentAssistantSpeech: Array<{ text: string; expiresAt: number }> = [];
  private recentUserTranscripts: Array<{ normalized: string; expiresAt: number }> = [];
  private microphoneRecoveryPromise: Promise<void> | null = null;
  private microphoneHealthTimer: number | null = null;
  private readonly turnQueue = new SequentialAsyncQueue<CommittedTurn>((turn) => this.processCommittedTurn(turn));
  private readonly actionQueue = new SequentialAsyncQueue<ActionTurn>((turn) => this.processActionTurn(turn));
  private automationSequenceId = 0;
  private actionGenerationSequenceId = 0;
  private automationTimers: number[] = [];
  private automationAuthorizationMessageId: string | null = null;
  private lastOpenAIResponseId: string | null = null;
  private pendingOpenAIResponseId: string | null = null;
  private navigationContext: NavigationContinuationContext | null = null;
  private pendingGuidanceClick: PendingGuidanceClick | null = null;
  private pendingClarificationContext: PendingClarificationContext | null = null;
  private microphoneStream: MediaStream | null = null;
  private sttTokenPromise: Promise<string> | null = null;
  private ttsTokenPromise: Promise<TtsTokenConfig | null> | null = null;

  constructor(script: HTMLScriptElement) {
    this.siteKey = script.dataset.barkanSite ?? "";
    this.scriptOrigin = new URL(script.src, window.location.href).origin;
    this.apiBaseUrl = this.scriptOrigin;
    this.preferredTextEntryMode = this.readPersistedTextEntryMode();
    this.setTextEntryMode(this.preferredTextEntryMode, { persistPreference: false });

    this.root = document.createElement("div");
    this.root.id = "barkan-widget-root";
    this.root.dataset.barkanChatTheme = "system";
    const shadowRoot = this.root.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          --barkan-font-ui: "Leurn", "Barkan Sans", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          --barkan-panel-bg: #ffffff;
          --barkan-panel-alt-bg: #fcfcfc;
          --barkan-panel-soft-bg: #f3f3f3;
          --barkan-panel-pill-bg: #f3f3f1;
          --barkan-panel-pill-hover-bg: #ececea;
          --barkan-panel-pill-active-bg: #e9e9e6;
          --barkan-panel-border: #dadada;
          --barkan-panel-border-soft: #e1e1df;
          --barkan-panel-border-muted: #dededb;
          --barkan-panel-border-pill: #e4e4df;
          --barkan-panel-border-pill-hover: #d8d8d2;
          --barkan-panel-text: #111111;
          --barkan-panel-text-muted: #666666;
          --barkan-panel-text-tertiary: #9a9a9a;
          --barkan-panel-text-placeholder: rgba(79, 80, 89, .8);
          --barkan-panel-thinking: #8a8a8a;
          --barkan-panel-thinking-active: #4a4a4a;
          --barkan-panel-control: #2f2f2f;
          --barkan-panel-control-hover: #424242;
          --barkan-panel-control-text: #ffffff;
          --barkan-panel-focus: rgba(17, 17, 17, .12);
          --barkan-panel-focus-strong: rgba(17, 17, 17, .14);
          --barkan-panel-resize: rgba(17, 17, 17, .16);
          --barkan-spinner-track: rgba(17, 17, 17, .18);
          --barkan-spinner-active: rgba(17, 17, 17, .64);
          --barkan-panel-shadow: rgba(0, 0, 0, .05);
          --barkan-panel-attachment: #babab7;
          --barkan-panel-chevron: #8e8e88;
          --barkan-mode-menu-bg: rgba(255, 255, 255, .88);
          --barkan-mode-menu-border: rgba(0, 0, 0, .14);
          --barkan-mode-menu-shadow: 0 18px 44px rgba(0, 0, 0, .18), 0 4px 12px rgba(0, 0, 0, .08);
          --barkan-mode-option-hover: rgba(0, 0, 0, .055);
          --barkan-mode-option-active: #0a84ff;
          --barkan-mode-option-active-text: #ffffff;
        }
        @media (prefers-color-scheme: dark) {
          :host([data-barkan-chat-theme="system"]) {
            color-scheme: dark;
            --barkan-panel-bg: #131313;
            --barkan-panel-alt-bg: #171717;
            --barkan-panel-soft-bg: #212121;
            --barkan-panel-pill-bg: #212121;
            --barkan-panel-pill-hover-bg: #2a2a2a;
            --barkan-panel-pill-active-bg: #303030;
            --barkan-panel-border: #262626;
            --barkan-panel-border-soft: #303030;
            --barkan-panel-border-muted: #343434;
            --barkan-panel-border-pill: #343434;
            --barkan-panel-border-pill-hover: #444444;
            --barkan-panel-text: #f4f4f4;
            --barkan-panel-text-muted: #b6b6b6;
            --barkan-panel-text-tertiary: #858585;
            --barkan-panel-text-placeholder: rgba(185, 185, 185, .72);
            --barkan-panel-thinking: #858585;
            --barkan-panel-thinking-active: #f1f1f1;
            --barkan-panel-control: #f2f2f2;
            --barkan-panel-control-hover: #ffffff;
            --barkan-panel-control-text: #131313;
            --barkan-panel-focus: rgba(255, 255, 255, .16);
            --barkan-panel-focus-strong: rgba(255, 255, 255, .2);
            --barkan-panel-resize: rgba(255, 255, 255, .18);
            --barkan-spinner-track: rgba(255, 255, 255, .18);
            --barkan-spinner-active: rgba(255, 255, 255, .58);
            --barkan-panel-shadow: rgba(0, 0, 0, .28);
            --barkan-panel-attachment: #777777;
            --barkan-panel-chevron: #a0a0a0;
            --barkan-mode-menu-bg: rgba(38, 38, 38, .86);
            --barkan-mode-menu-border: rgba(255, 255, 255, .16);
            --barkan-mode-menu-shadow: 0 18px 44px rgba(0, 0, 0, .42), 0 4px 12px rgba(0, 0, 0, .2);
            --barkan-mode-option-hover: rgba(255, 255, 255, .08);
            --barkan-mode-option-active: #0a84ff;
            --barkan-mode-option-active-text: #ffffff;
          }
        }
        :host([data-barkan-chat-theme="dark"]) {
          color-scheme: dark;
          --barkan-panel-bg: #131313;
          --barkan-panel-alt-bg: #171717;
          --barkan-panel-soft-bg: #212121;
          --barkan-panel-pill-bg: #212121;
          --barkan-panel-pill-hover-bg: #2a2a2a;
          --barkan-panel-pill-active-bg: #303030;
          --barkan-panel-border: #262626;
          --barkan-panel-border-soft: #303030;
          --barkan-panel-border-muted: #343434;
          --barkan-panel-border-pill: #343434;
          --barkan-panel-border-pill-hover: #444444;
          --barkan-panel-text: #f4f4f4;
          --barkan-panel-text-muted: #b6b6b6;
          --barkan-panel-text-tertiary: #858585;
          --barkan-panel-text-placeholder: rgba(185, 185, 185, .72);
          --barkan-panel-thinking: #858585;
          --barkan-panel-thinking-active: #f1f1f1;
          --barkan-panel-control: #f2f2f2;
          --barkan-panel-control-hover: #ffffff;
          --barkan-panel-control-text: #131313;
          --barkan-panel-focus: rgba(255, 255, 255, .16);
          --barkan-panel-focus-strong: rgba(255, 255, 255, .2);
          --barkan-panel-resize: rgba(255, 255, 255, .18);
          --barkan-spinner-track: rgba(255, 255, 255, .18);
          --barkan-spinner-active: rgba(255, 255, 255, .58);
          --barkan-panel-shadow: rgba(0, 0, 0, .28);
          --barkan-panel-attachment: #777777;
          --barkan-panel-chevron: #a0a0a0;
          --barkan-mode-menu-bg: rgba(38, 38, 38, .86);
          --barkan-mode-menu-border: rgba(255, 255, 255, .16);
          --barkan-mode-menu-shadow: 0 18px 44px rgba(0, 0, 0, .42), 0 4px 12px rgba(0, 0, 0, .2);
          --barkan-mode-option-hover: rgba(255, 255, 255, .08);
          --barkan-mode-option-active: #0a84ff;
          --barkan-mode-option-active-text: #ffffff;
        }
        .launcher-button,
        .call-control,
        .agent {
          position: fixed;
          z-index: 2147483647;
          font-family: var(--barkan-font-ui);
        }
        .launcher-button {
          right: 28px;
          bottom: 28px;
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: rgba(0, 0, 0, .7);
          box-shadow: 0 8px 20px rgba(0, 0, 0, .22);
          backdrop-filter: blur(5.05px);
          -webkit-backdrop-filter: blur(5.05px);
          color: #fff;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transform: translate3d(0, 12px, 0) scale(.96);
          transition: opacity 180ms ease, transform 220ms cubic-bezier(.22, 1, .36, 1), filter 140ms ease;
        }
        .launcher-button[data-visible="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translate3d(0, 0, 0) scale(1);
        }
        .launcher-button:hover {
          filter: brightness(1.08);
        }
        .launcher-button:active {
          transform: translate3d(0, 0, 0) scale(.97);
        }
        .launcher-button:focus-visible {
          outline: none;
          box-shadow: 0 8px 20px rgba(0, 0, 0, .22), 0 0 0 3px rgba(255, 255, 255, .28);
        }
        .launcher-button svg {
          width: 25px;
          height: 25px;
          display: block;
        }
        .barkan-spinner {
          display: none;
          width: 23px;
          height: 23px;
          box-sizing: border-box;
          border: 4px solid var(--barkan-spinner-track);
          border-top-color: var(--barkan-spinner-active);
          border-radius: 999px;
          animation: barkan-spin 500ms linear infinite;
        }
        .launcher-button .barkan-spinner {
          border-color: rgba(255, 255, 255, .22);
          border-top-color: rgba(255, 255, 255, .68);
        }
        .launcher-button[data-busy="true"] .launcher-icon {
          display: none;
        }
        .launcher-button[data-busy="true"] .barkan-spinner {
          display: block;
        }
        @keyframes barkan-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .call-control {
          bottom: 14px;
          left: 50%;
          width: min(304px, calc(100vw - 28px));
          height: 54px;
          opacity: 0;
          pointer-events: none;
          transform: translate3d(-50%, 14px, 0);
          transition: opacity 160ms ease, transform 160ms ease, width 220ms ease, height 220ms ease;
        }
        .call-control[data-visible="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translate3d(-50%, 0, 0);
        }
        .call-panel {
          position: absolute;
          inset: 0;
          border-radius: 15px;
          background: rgba(0, 0, 0, .7);
          box-shadow: 0 8px 20px rgba(0, 0, 0, .22);
          backdrop-filter: blur(5.05px);
          -webkit-backdrop-filter: blur(5.05px);
          transition: border-radius 220ms ease, background 220ms ease;
        }
        .call-button {
          position: absolute;
          top: 7px;
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 0;
          border-radius: 10px;
          color: #fff;
          cursor: pointer;
          outline: none;
          transition: filter 140ms ease, opacity 140ms ease, transform 140ms ease;
        }
        .call-button:hover {
          filter: brightness(1.08);
        }
        .call-button:active {
          transform: scale(.97);
        }
        .call-button:focus-visible {
          box-shadow: 0 0 0 3px rgba(255, 255, 255, .28);
        }
        .mic-button {
          left: 7px;
          background: #5b5b5b;
        }
        .mic-button svg {
          transition: opacity 180ms ease, transform 220ms cubic-bezier(.22, 1, .36, 1);
        }
        .call-control[data-muted="true"] .mic-button svg {
          opacity: .9;
          transform: scale(.96);
        }
        .hangup-button {
          right: 7px;
          background: #d63031;
        }
        .mute-slash {
          position: absolute;
          inset: 0;
          width: 22px;
          height: 22px;
          margin: auto;
          color: #fff;
          opacity: 0;
          pointer-events: none;
          transform: scale(.92);
          transform-origin: center;
          transition:
            opacity 150ms ease,
            transform 220ms cubic-bezier(.22, 1, .36, 1);
        }
        .mute-slash::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 22px;
          height: 1.4px;
          border-radius: 999px;
          background: currentColor;
          transform: translate(-50%, -50%) rotate(-45deg) scaleX(0);
          transform-origin: center;
          transition: transform 260ms cubic-bezier(.22, 1, .36, 1);
        }
        .call-control[data-muted="true"] .mute-slash {
          opacity: .9;
          transform: scale(1);
        }
        .call-control[data-muted="true"] .mute-slash::before {
          transform: translate(-50%, -50%) rotate(-45deg) scaleX(1);
        }
        .waveform {
          position: absolute;
          left: 50%;
          top: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 70px;
          height: 30px;
          transform: translateX(-50%);
          overflow: hidden;
          transition: opacity 160ms ease;
        }
        .chat-panel {
          position: fixed;
          z-index: 2147483647;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(var(--barkan-chat-sidebar-width, ${CHAT_SIDEBAR_WIDTH_PX}px), 100vw);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          border: 0;
          border-left: 1px solid var(--barkan-panel-border);
          border-radius: 0;
          background: var(--barkan-panel-bg);
          box-shadow: none;
          color: var(--barkan-panel-text);
          font-family: var(--barkan-font-ui);
          opacity: 0;
          pointer-events: none;
          transform: translate3d(100%, 0, 0);
          transform-origin: right center;
          transition: opacity ${CHAT_SIDEBAR_TRANSITION_MS}ms ease, transform ${CHAT_SIDEBAR_TRANSITION_MS}ms cubic-bezier(.22, 1, .36, 1);
          overflow: hidden;
        }
        .chat-panel[data-visible="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translate3d(0, 0, 0);
        }
        .chat-panel[data-resizing="true"] {
          transition: none;
          user-select: none;
        }
        .chat-panel__resize-handle {
          position: absolute;
          left: -5px;
          top: 0;
          bottom: 0;
          z-index: 3;
          width: 10px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: col-resize;
          touch-action: none;
        }
        .chat-panel__resize-handle::before {
          content: "";
          position: absolute;
          left: 4px;
          top: 50%;
          width: 2px;
          height: 48px;
          border-radius: 999px;
          background: var(--barkan-panel-resize);
          opacity: 0;
          transform: translateY(-50%) scaleY(.7);
          transition: opacity 160ms ease, transform 180ms cubic-bezier(.22, 1, .36, 1);
        }
        .chat-panel__resize-handle:hover::before,
        .chat-panel__resize-handle:focus-visible::before,
        .chat-panel[data-resizing="true"] .chat-panel__resize-handle::before {
          opacity: 1;
          transform: translateY(-50%) scaleY(1);
        }
        .chat-panel__header {
          flex: 0 0 auto;
          min-height: 62px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
          padding: 0 20px 0 28px;
          background: var(--barkan-panel-bg);
          box-sizing: border-box;
        }
        .chat-panel__header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .chat-panel__close {
          width: 32px;
          height: 32px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--barkan-panel-text);
          cursor: pointer;
          transition: background-color 180ms ease, opacity 180ms ease;
        }
        .chat-panel__close:hover {
          background: var(--barkan-panel-pill-bg);
        }
        .chat-panel__close:disabled {
          cursor: default;
          opacity: .7;
        }
        .chat-panel__close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px var(--barkan-panel-focus-strong);
        }
        .chat-panel__thread {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 24px 28px 24px;
          background: var(--barkan-panel-bg);
          overscroll-behavior: contain;
          scrollbar-width: none;
        }
        .chat-panel__thread::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .chat-panel__messages {
          width: 100%;
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 24px;
        }
        .chat-panel__message-item {
          display: flex;
        }
        .chat-panel__message-item--assistant {
          justify-content: flex-start;
        }
        .chat-panel__message-item--assistant + .chat-panel__message-item--assistant {
          margin-top: -10px;
        }
        .chat-panel__message-item--user {
          justify-content: flex-end;
        }
        .chat-panel__message {
          max-width: 100%;
        }
        .chat-panel__message--assistant {
          width: 100%;
          padding: 0;
          background: transparent;
          color: var(--barkan-panel-text);
        }
        .chat-panel__message--user {
          max-width: min(622px, 78%);
          padding: 12px 16px;
          border-radius: 18px;
          background: var(--barkan-panel-soft-bg);
          color: var(--barkan-panel-text);
        }
        .chat-panel__message-content {
          margin: 0;
          color: inherit;
          text-align: left;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.6;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .chat-panel__thinking-line {
          display: block;
          max-width: 100%;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.6;
          white-space: normal;
          overflow: hidden;
        }
        .chat-panel__thinking-text {
          position: relative;
          display: inline-grid;
          grid-template-areas: "label";
          align-items: start;
          overflow: visible;
          color: var(--barkan-panel-thinking);
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          vertical-align: top;
        }
        .chat-panel__thinking-label {
          grid-area: label;
          min-width: 0;
          overflow: visible;
          white-space: normal;
          overflow-wrap: anywhere;
          will-change: transform, opacity, filter;
        }
        .chat-panel__thinking-label--leaving {
          animation: barkan-thinking-label-out 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-panel__thinking-label--entering {
          animation: barkan-thinking-label-in 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-panel__message-content--thinking-static {
          color: var(--barkan-panel-thinking);
          font-weight: 600;
        }
        .chat-panel__activity-toggle {
          width: 100%;
          padding: 0;
          border: 0;
          display: block;
          background: transparent;
          color: var(--barkan-panel-thinking);
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.6;
          text-align: left;
          cursor: pointer;
        }
        .chat-panel__activity-toggle:hover {
          opacity: .82;
        }
        .chat-panel__activity-toggle:focus-visible {
          outline: none;
          box-shadow: 0 0 0 1px var(--barkan-panel-focus-strong);
          border-radius: 8px;
        }
        .chat-panel__activity-details {
          margin-top: 10px;
          display: grid;
          gap: 12px;
        }
        .chat-panel__activity-entry {
          display: grid;
          gap: 6px;
        }
        .chat-panel__activity-line {
          margin: 0;
          color: var(--barkan-panel-text-muted);
          font-size: 13px;
          font-weight: 400;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .chat-panel__activity-line-label {
          color: var(--barkan-panel-text-tertiary);
        }
        .action-summary-card {
          width: min(100%, 560px);
          box-sizing: border-box;
          border: 1px solid var(--barkan-panel-border);
          border-radius: 8px;
          background: var(--barkan-panel-bg);
          color: var(--barkan-panel-text);
          box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
          overflow: hidden;
        }
        .action-summary-card__main {
          min-height: 78px;
          padding: 12px 12px;
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
        }
        .action-summary-card__icon {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--barkan-panel-soft-bg);
          color: #5f5f5f;
        }
        .action-summary-card__icon svg {
          width: 24px;
          height: 24px;
          display: block;
        }
        .action-summary-card__body {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .action-summary-card__title {
          margin: 0;
          min-width: 0;
          color: var(--barkan-panel-text);
          font-family: var(--barkan-font-ui);
          font-size: 14px;
          font-weight: 400;
          line-height: 1.32;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }
        .action-summary-card__counts {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-height: 18px;
          font-size: 15px;
          font-weight: 400;
          line-height: 1;
        }
        .action-summary-card__count--positive {
          color: #30a251;
        }
        .action-summary-card__count--negative {
          color: #de3d35;
        }
        .action-summary-card__undo {
          padding: 0 4px;
          border: 0;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          color: var(--barkan-panel-text);
          font: inherit;
          font-size: 15px;
          font-weight: 400;
          line-height: 1;
          cursor: default;
        }
        .action-summary-card__undo svg {
          width: 18px;
          height: 18px;
          display: block;
        }
        .action-summary-card__details {
          width: 100%;
          min-height: 46px;
          padding: 0 12px;
          border: 0;
          border-top: 1px solid var(--barkan-panel-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: transparent;
          color: var(--barkan-panel-text);
          font: inherit;
          font-size: 14px;
          font-weight: 400;
          line-height: 1;
          text-align: left;
          cursor: default;
        }
        .action-summary-card__details svg {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
          color: #4d4d4d;
        }
        .action-summary-card__undo:focus-visible,
        .action-summary-card__details:focus-visible {
          outline: none;
          box-shadow: inset 0 0 0 2px var(--barkan-panel-focus-strong);
        }
        .chat-panel__thinking-text::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          bottom: 0;
          left: -96px;
          right: -96px;
          box-sizing: border-box;
          padding: 0 96px;
          color: var(--barkan-panel-thinking-active);
          pointer-events: none;
          white-space: normal;
          overflow-wrap: anywhere;
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 36%, #000 64%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0%, #000 36%, #000 64%, transparent 100%);
          -webkit-mask-size: 30% 100%;
          mask-size: 30% 100%;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: -34% 0;
          mask-position: -34% 0;
          animation: barkan-thinking-sweep 2s linear infinite;
          will-change: -webkit-mask-position, mask-position;
        }
        @keyframes barkan-thinking-label-out {
          0% {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-8px);
            filter: blur(0.4px);
          }
        }
        @keyframes barkan-thinking-label-in {
          0% {
            opacity: 0;
            transform: translateY(10px);
            filter: blur(0.4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
        @keyframes barkan-thinking-sweep {
          0% {
            -webkit-mask-position: -34% 0;
            mask-position: -34% 0;
          }
          100% {
            -webkit-mask-position: 134% 0;
            mask-position: 134% 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-panel__thinking-text::after {
            animation: none;
            content: none;
          }
          .chat-panel__thinking-label {
            animation: none;
            transform: none;
            filter: none;
          }
        }
        .chat-panel__message--authorization {
          width: min(552px, 100%);
          padding: 14px;
          border: 1px solid var(--barkan-panel-border-muted);
          border-radius: 8px;
          background: var(--barkan-panel-bg);
          color: var(--barkan-panel-text);
        }
        .authorization-card {
          display: grid;
          gap: 10px;
        }
        .authorization-card__header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .authorization-card__logo {
          width: 24px;
          height: 24px;
          flex: 0 0 auto;
          display: block;
        }
        .authorization-card__title {
          margin: 0;
          color: var(--barkan-panel-text);
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
        }
        .authorization-card__copy {
          margin: 0;
          color: var(--barkan-panel-text-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .authorization-card__button {
          justify-self: start;
          min-height: 32px;
          border: 1px solid var(--barkan-panel-control);
          border-radius: 7px;
          padding: 0 12px;
          background: var(--barkan-panel-control);
          color: var(--barkan-panel-control-text);
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .authorization-card__button:disabled {
          opacity: .55;
          cursor: default;
        }
        .chat-panel__empty {
          min-height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--barkan-panel-text-tertiary);
        }
        .chat-panel__empty strong {
          display: block;
          color: var(--barkan-panel-text);
          font-size: 22px;
          font-weight: 700;
          line-height: 1.15;
        }
        .chat-panel__empty-mode {
          margin-top: 5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-wrap: nowrap;
          gap: 4px;
          color: var(--barkan-panel-text-tertiary);
          font-size: 20px;
          font-weight: 700;
          line-height: 1.15;
        }
        .barkan-mode-picker {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex: 0 0 auto;
          z-index: 2;
        }
        .chat-panel__empty-mode-control {
          width: auto;
        }
        .barkan-mode-picker__button {
          width: 100%;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          color: var(--barkan-panel-text-tertiary);
          cursor: pointer;
          font: inherit;
          outline: none;
          box-shadow: none;
          transition:
            background-color 180ms ease,
            color 180ms ease,
            transform 160ms cubic-bezier(.2, .8, .2, 1);
        }
        .barkan-mode-picker__button:hover,
        .barkan-mode-picker[data-open="true"] .barkan-mode-picker__button {
          background: var(--barkan-panel-pill-bg);
          color: var(--barkan-panel-text);
        }
        .barkan-mode-picker__button:active {
          transform: scale(.985);
        }
        .barkan-mode-picker__button:focus-visible {
          background: var(--barkan-panel-pill-bg);
          color: var(--barkan-panel-text);
          box-shadow: 0 0 0 3px var(--barkan-panel-focus);
        }
        .barkan-mode-picker__label {
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .barkan-mode-picker__chevron {
          flex: 0 0 auto;
          color: var(--barkan-panel-chevron);
          pointer-events: none;
          transition:
            color 180ms ease,
            transform 220ms cubic-bezier(.2, .8, .2, 1);
        }
        .barkan-mode-picker[data-open="true"] .barkan-mode-picker__chevron {
          color: currentColor;
          transform: rotate(180deg);
        }
        .barkan-mode-picker__menu {
          position: absolute;
          left: 50%;
          z-index: 2147483647;
          width: max-content;
          min-width: 132px;
          padding: 4px;
          display: grid;
          gap: 5px;
          border: 1px solid var(--barkan-mode-menu-border);
          border-radius: 14px;
          background: var(--barkan-mode-menu-bg);
          color: var(--barkan-panel-text);
          box-shadow: var(--barkan-mode-menu-shadow);
          backdrop-filter: blur(22px) saturate(1.55);
          -webkit-backdrop-filter: blur(22px) saturate(1.55);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translate3d(-50%, -6px, 0) scale(.975);
          transform-origin: top center;
          transition:
            opacity 150ms ease,
            visibility 0ms linear 150ms,
            transform 220ms cubic-bezier(.2, .85, .2, 1);
        }
        .barkan-mode-picker[data-open="true"] .barkan-mode-picker__menu {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translate3d(-50%, 0, 0) scale(1);
          transition:
            opacity 130ms ease,
            visibility 0ms linear,
            transform 220ms cubic-bezier(.2, .85, .2, 1);
        }
        .barkan-mode-picker__option {
          width: 100%;
          height: 28px;
          border: 0;
          border-radius: 9px;
          padding: 0 10px 0 8px;
          display: grid;
          grid-template-columns: 15px minmax(0, 1fr);
          align-items: center;
          gap: 5px;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          color: var(--barkan-panel-text);
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          text-align: left;
          outline: none;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .barkan-mode-picker__option:hover,
        .barkan-mode-picker__option:focus-visible {
          background: var(--barkan-mode-option-hover);
        }
        .barkan-mode-picker__option[aria-selected="true"] {
          background: var(--barkan-mode-option-active);
          color: var(--barkan-mode-option-active-text);
        }
        .barkan-mode-picker__check {
          width: 14px;
          height: 14px;
          opacity: 0;
        }
        .barkan-mode-picker__option[aria-selected="true"] .barkan-mode-picker__check {
          opacity: 1;
        }
        .barkan-mode-picker__option-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__button {
          width: auto;
          height: 1.45em;
          padding: 0 22px 0 10px;
          line-height: inherit;
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__label {
          display: block;
          margin-top: 0;
          overflow: visible;
          text-overflow: clip;
          line-height: 1;
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__chevron {
          position: absolute;
          right: 6px;
          top: 50%;
          width: 12px;
          height: 12px;
          transform: translateY(-50%);
        }
        .chat-panel__empty-mode-control[data-open="true"] .barkan-mode-picker__chevron {
          transform: translateY(-50%) rotate(180deg);
        }
        .chat-panel__empty-mode-control .barkan-mode-picker__menu {
          top: calc(100% + 10px);
          left: 0;
          transform: translate3d(0, -6px, 0) scale(.975);
          transform-origin: top left;
        }
        .chat-panel__empty-mode-control[data-open="true"] .barkan-mode-picker__menu {
          transform: translate3d(0, 0, 0) scale(1);
        }
        .chat-panel__empty .chat-panel__empty-mode-suffix {
          margin-top: 0;
          display: inline;
          white-space: nowrap;
          font: inherit;
          line-height: inherit;
        }
        .chat-panel__empty[data-visible="false"] {
          display: none;
        }
        .text-entry {
          flex: 0 0 auto;
          width: auto;
          min-height: 110px;
          margin: 0 28px 28px;
          padding: 18px 14px 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 0;
          box-sizing: border-box;
          border: 1px solid var(--barkan-panel-border-soft);
          border-radius: 22px;
          background: var(--barkan-panel-alt-bg);
          box-shadow: 0 2px 4px var(--barkan-panel-shadow);
        }
        .text-entry[data-has-question="true"] {
          min-height: 0;
          padding: 0;
          border: 0;
          background: transparent;
          box-shadow: none;
        }
        .text-entry__choices {
          display: none;
          margin: 0 0 14px;
        }
        .text-entry__choices[data-visible="true"] {
          display: block;
        }
        .text-entry[data-has-question="true"] .text-entry__choices {
          margin: 0;
        }
        .text-entry[data-has-question="true"] .text-entry__body,
        .text-entry[data-has-question="true"] .text-entry__footer {
          display: none;
        }
        .barkan-question-panel {
          width: 100%;
          box-sizing: border-box;
          padding: 16px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--barkan-panel-border-soft);
          border-radius: 22px;
          background: var(--barkan-panel-alt-bg);
          color: var(--barkan-panel-text);
          font-family: inherit;
          box-shadow: 0 2px 4px rgba(0, 0, 0, .05);
          outline: none;
          transform-origin: center bottom;
        }
        .barkan-question-panel[data-animate="true"] {
          animation: barkan-question-panel-enter 340ms cubic-bezier(.22, 1, .36, 1);
        }
        .barkan-question-panel__header,
        .barkan-question-panel__footer {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .barkan-question-panel__heading {
          min-width: 0;
          padding: 4px 0 0 4px;
        }
        .barkan-question-panel__prompt {
          margin: 0;
          color: var(--barkan-panel-text);
          font-family: inherit;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__nav {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
        }
        .barkan-question-panel__nav-button {
          width: 15px;
          height: 15px;
          padding: 0;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: #878787;
          cursor: pointer;
          transition: opacity 180ms ease;
        }
        .barkan-question-panel__nav-button:disabled {
          opacity: .3;
          cursor: default;
        }
        .barkan-question-panel__progress {
          margin: 0;
          color: #878787;
          font-family: inherit;
          font-size: 12px;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__options {
          margin-top: 14px;
          display: grid;
          align-content: start;
          gap: 4px;
        }
        .barkan-question-panel__option {
          min-height: 37px;
          padding: 0 10px 0 9px;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr) auto;
          align-items: center;
          gap: 0;
          border: 0;
          border-radius: 11px;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: background-color 180ms ease, opacity 180ms ease;
        }
        .barkan-question-panel__option:hover {
          background: var(--barkan-panel-pill-bg);
        }
        .barkan-question-panel__option[data-selected="true"] {
          background: var(--barkan-panel-soft-bg);
        }
        .barkan-question-panel__option[data-editable="true"][data-selected="true"] {
          align-items: center;
          padding-top: 9px;
          padding-bottom: 9px;
        }
        .barkan-question-panel__option-index {
          color: var(--barkan-panel-text-tertiary);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__option-main {
          min-width: 0;
        }
        .barkan-question-panel__option-label {
          display: block;
          min-width: 0;
          color: var(--barkan-panel-text);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.265;
          letter-spacing: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .barkan-question-panel__option[data-editable="true"]:not([data-selected="true"]) .barkan-question-panel__option-label {
          color: var(--barkan-panel-text-tertiary);
        }
        .barkan-question-panel__option-input {
          width: 100%;
          min-height: 18px;
          display: block;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--barkan-panel-text);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.265;
          letter-spacing: 0;
          resize: none;
          overflow: hidden;
          outline: none;
        }
        .barkan-question-panel__option-input::placeholder {
          color: var(--barkan-panel-text-tertiary);
        }
        .barkan-question-panel__option-controls {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .barkan-question-panel__option-control {
          width: 13px;
          height: 13px;
          padding: 0;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--barkan-panel-text-tertiary);
          cursor: pointer;
          transition: opacity 180ms ease;
        }
        .barkan-question-panel__option-control:disabled {
          opacity: .35;
          cursor: default;
        }
        .barkan-question-panel__footer {
          margin-top: 12px;
          padding-top: 0;
          align-items: center;
          justify-content: flex-end;
        }
        .barkan-question-panel__dismiss {
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--barkan-panel-text-tertiary);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.265;
          letter-spacing: 0;
          cursor: pointer;
        }
        .barkan-question-panel__keycap {
          min-width: 37px;
          height: 20px;
          padding: 0 9px;
          border-radius: 33px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          background: var(--barkan-panel-soft-bg);
          color: var(--barkan-panel-text);
          font-size: 10px;
          font-weight: 500;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__continue {
          width: 103px;
          height: 31px;
          padding: 0 10px 0 9px;
          border: 0;
          border-radius: 79px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          background: var(--barkan-panel-control);
          color: var(--barkan-panel-control-text);
          cursor: pointer;
          transition: background-color 180ms ease, opacity 180ms ease;
        }
        .barkan-question-panel__continue:hover {
          background: var(--barkan-panel-control-hover);
        }
        .barkan-question-panel__continue:disabled,
        .barkan-question-panel__dismiss:disabled {
          opacity: .45;
          cursor: not-allowed;
        }
        .barkan-question-panel__continue-label {
          color: var(--barkan-panel-control-text);
          font-size: 14px;
          font-weight: 500;
          line-height: 1.265;
          letter-spacing: 0;
        }
        .barkan-question-panel__continue-icon {
          width: 24px;
          height: 16px;
          border-radius: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--barkan-panel-control-text) 20%, transparent);
        }
        @keyframes barkan-question-panel-enter {
          0% {
            opacity: 0;
            transform: translateY(12px) scaleY(.88);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }
        .text-entry__body {
          flex: 0 0 auto;
          min-height: 52px;
          padding: 0;
          display: grid;
          align-content: start;
        }
        .text-entry__input {
          width: 100%;
          min-height: 20px;
          max-height: 132px;
          border: 0;
          padding: 0;
          resize: none;
          overflow: auto;
          color: var(--barkan-panel-text);
          background: transparent;
          caret-color: var(--barkan-panel-text);
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.35;
          outline: none;
          box-shadow: none;
        }
        .text-entry__input::placeholder {
          color: var(--barkan-panel-text-placeholder);
        }
        .text-entry__input:focus,
        .text-entry__input:focus-visible {
          outline: none;
          box-shadow: none;
        }
        .text-entry__footer {
          display: flex;
          align-items: center;
          min-height: 31px;
          gap: 11px;
        }
        .text-entry__attach {
          width: 21px;
          height: 21px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--barkan-panel-attachment);
        }
        .text-entry__mode {
          position: relative;
          flex: 0 0 auto;
          width: 68px;
          height: 31px;
          display: inline-flex;
          align-items: center;
        }
        .text-entry[data-mode="act"] .text-entry__mode {
          width: 52px;
        }
        .text-entry[data-mode="automation"] .text-entry__mode {
          width: 112px;
        }
        .text-entry__mode .barkan-mode-picker__button {
          height: 31px;
          padding: 0 24px 0 0;
          color: var(--barkan-panel-text-tertiary);
          font-size: 14px;
          font-weight: 700;
          line-height: 31px;
        }
        .text-entry__mode .barkan-mode-picker__button:hover,
        .text-entry__mode[data-open="true"] .barkan-mode-picker__button {
          background: transparent;
          color: var(--barkan-panel-text);
        }
        .text-entry__mode .barkan-mode-picker__button:focus-visible {
          background: transparent;
          color: var(--barkan-panel-text);
          box-shadow: 0 0 0 3px var(--barkan-panel-focus);
        }
        .text-entry__mode .barkan-mode-picker__menu {
          bottom: calc(100% + 8px);
          transform: translate3d(-50%, 6px, 0) scale(.975);
          transform-origin: bottom center;
        }
        .text-entry__mode[data-open="true"] .barkan-mode-picker__menu {
          transform: translate3d(-50%, 0, 0) scale(1);
        }
        .text-entry__mode .barkan-mode-picker__chevron {
          position: absolute;
          right: 12px;
          top: 50%;
          width: 11px;
          height: 11px;
          transform: translateY(-50%);
        }
        .text-entry__mode[data-open="true"] .barkan-mode-picker__chevron {
          transform: translateY(-50%) rotate(180deg);
        }
        .text-entry[data-mode="act"] .text-entry__mode .barkan-mode-picker__button,
        .text-entry[data-mode="automation"] .text-entry__mode .barkan-mode-picker__button {
          color: var(--barkan-panel-text);
        }
        .text-entry__actions {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .text-entry__send {
          width: 31px;
          height: 31px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          background: var(--barkan-panel-control);
          color: var(--barkan-panel-control-text);
          cursor: pointer;
          outline: none;
          transition: background-color 180ms ease, opacity 180ms ease, transform 140ms ease;
        }
        .text-entry__send:hover:not(:disabled) {
          background: var(--barkan-panel-control-hover);
        }
        .text-entry__send:active:not(:disabled) {
          transform: scale(.97);
        }
        .text-entry__send:disabled {
          background: var(--barkan-panel-soft-bg);
          color: var(--barkan-panel-text-tertiary);
          opacity: 1;
          cursor: default;
        }
        .text-entry__send:focus-visible {
          box-shadow: 0 0 0 3px var(--barkan-panel-focus-strong);
        }
        .text-entry__send svg {
          width: 19px;
          height: 19px;
          display: block;
          flex: 0 0 auto;
        }
        .text-entry__voice-icon {
          display: none !important;
        }
        .text-entry__send[data-input-empty="true"] .text-entry__send-icon {
          display: none !important;
        }
        .text-entry__send[data-input-empty="true"] .text-entry__voice-icon {
          display: block !important;
        }
        .text-entry__send[data-generating="true"] {
          background: #efefef;
          color: #111111;
        }
        .text-entry__send[data-generating="true"]:hover {
          background: #e7e7e7;
        }
        .text-entry__send[data-generating="true"] svg {
          display: none !important;
        }
        .text-entry__stop-icon {
          display: none;
          width: 10px;
          height: 10px;
          border-radius: 2px;
          background: #111111;
        }
        .text-entry__send[data-generating="true"] .text-entry__stop-icon {
          display: block;
        }
        @media (max-width: 560px) {
          .chat-panel {
            width: 100vw;
          }
          .chat-panel__resize-handle {
            display: none;
          }
          .chat-panel__header {
            padding: 0 18px 0 22px;
          }
          .chat-panel__thread {
            padding: 22px 22px 20px;
          }
          .chat-panel__message--user {
            max-width: 88%;
          }
          .text-entry {
            margin: 0 18px 18px;
          }
        }
        .waveform-bar {
          width: 3px;
          border-radius: 8px;
          background: #fff;
          transform: scaleY(.42);
          transform-origin: center;
          transition: opacity 120ms ease;
        }
        .waveform-bar:nth-child(1) { height: 16px; opacity: .42; }
        .waveform-bar:nth-child(2) { height: 21px; opacity: .56; }
        .waveform-bar:nth-child(3) { height: 11px; opacity: .72; }
        .waveform-bar:nth-child(4) { height: 18px; opacity: .9; }
        .waveform-bar:nth-child(5) { height: 8px; opacity: 1; }
        .waveform-bar:nth-child(6) { height: 15px; opacity: .9; }
        .waveform-bar:nth-child(7) { height: 23px; opacity: .72; }
        .waveform-bar:nth-child(8) { height: 12px; opacity: .56; }
        .waveform-bar:nth-child(9) { height: 16px; opacity: .42; }
        .call-control[data-muted="true"] .waveform-bar,
        .call-control[data-state="error"] .waveform-bar {
          opacity: .3;
        }
        .agent {
          left: 0;
          top: 0;
          width: 240px;
          min-height: 54px;
          opacity: 0;
          pointer-events: none;
          transform: translate3d(12px, 12px, 0);
          transition: opacity 140ms ease, transform 240ms cubic-bezier(.22, 1, .36, 1);
          overflow: visible;
        }
        .agent[data-visible="true"] {
          opacity: 1;
        }
        .agent-pointer {
          position: absolute;
          width: 28px;
          height: 28px;
          filter: drop-shadow(1px 2px 2px rgba(0, 0, 0, .18));
          opacity: 1;
          transform-origin: center;
          transition: opacity 120ms ease;
        }
        .agent[data-placement="below-right"] .agent-pointer {
          left: 0;
          top: 0;
          right: auto;
          bottom: auto;
          transform: none;
        }
        .agent[data-placement="below-left"] .agent-pointer {
          left: auto;
          top: 0;
          right: 0;
          bottom: auto;
          transform: scaleX(-1);
        }
        .agent[data-placement="above-right"] .agent-pointer {
          left: 0;
          top: auto;
          right: auto;
          bottom: 0;
          transform: scaleY(-1);
        }
        .agent[data-placement="above-left"] .agent-pointer {
          left: auto;
          top: auto;
          right: 0;
          bottom: 0;
          transform: scale(-1, -1);
        }
        .agent-bubble {
          position: absolute;
          box-sizing: border-box;
          width: max-content;
          min-width: min(180px, calc(100vw - 48px));
          max-width: min(360px, calc(100vw - 48px));
          max-height: min(240px, calc(100vh - 48px));
          min-height: 30px;
          padding: 7px 10px;
          border-radius: 8px;
          background: #ff6b00;
          color: #fff;
          font-family: var(--barkan-font-ui);
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
          box-shadow: 1px 2px 2.5px rgba(0, 0, 0, .15);
          overflow-x: hidden;
          overflow-y: auto;
          white-space: normal;
          overflow-wrap: break-word;
          word-break: normal;
        }
        .agent[data-placement="below-right"] .agent-bubble {
          left: 32px;
          top: 20px;
          right: auto;
          bottom: auto;
        }
        .agent[data-placement="below-left"] .agent-bubble {
          left: auto;
          top: 20px;
          right: 32px;
          bottom: auto;
        }
        .agent[data-placement="above-right"] .agent-bubble {
          left: 32px;
          top: auto;
          right: auto;
          bottom: 20px;
        }
        .agent[data-placement="above-left"] .agent-bubble {
          left: auto;
          top: auto;
          right: 32px;
          bottom: 20px;
        }
        .agent-bubble[data-empty="true"] {
          display: none;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        @media (max-width: 390px) {
          .call-control {
            width: min(280px, calc(100vw - 24px));
            height: 50px;
          }
          .call-button {
            top: 6px;
            width: 38px;
            height: 38px;
          }
          .waveform {
            top: 11px;
            width: 64px;
          }
        }
      </style>
      <button class="launcher-button" type="button" data-visible="true" data-busy="false" aria-label="Open Barkan chat" title="Open Barkan chat">
        <span class="launcher-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M5.337 21.718a6.707 6.707 0 0 1-.533-.074.75.75 0 0 1-.44-1.223 3.73 3.73 0 0 0 .814-1.686c.023-.115-.022-.317-.254-.543C3.274 16.587 2.25 14.41 2.25 12c0-5.03 4.428-9 9.75-9s9.75 3.97 9.75 9c0 5.03-4.428 9-9.75 9-.833 0-1.643-.097-2.417-.279a6.721 6.721 0 0 1-4.246.997Z" clip-rule="evenodd"/>
          </svg>
        </span>
        <span class="barkan-spinner" aria-hidden="true"></span>
      </button>
      <div class="call-control" data-visible="false" data-state="idle" data-muted="false" data-text-mode="false">
        <div class="call-panel"></div>
        <button class="call-button mic-button" type="button" aria-label="Mute microphone" title="Mute microphone">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 15.5a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5.5a4 4 0 0 0 4 4Zm6.75-4a.75.75 0 0 0-1.5 0 5.25 5.25 0 0 1-10.5 0 .75.75 0 0 0-1.5 0 6.75 6.75 0 0 0 6 6.7v2.05H8.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-2.75V18.2a6.75 6.75 0 0 0 6-6.7Z"/>
          </svg>
          <span class="mute-slash"></span>
        </button>
        <div class="waveform" aria-hidden="true">
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
          <span class="waveform-bar"></span>
        </div>
        <button class="call-button hangup-button" type="button" aria-label="End Barkan call" title="End call">
          <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9l-2.2 1.1a1 1 0 0 1-1.32-.45l-1.1-2.2a1 1 0 0 1 .33-1.25C4.75 9.1 8.25 8 12 8s7.25 1.1 10.45 2.92a1 1 0 0 1 .33 1.25l-1.1 2.2a1 1 0 0 1-1.32.45l-2.2-1.1a1 1 0 0 1-.56-.9v-3.1A15.2 15.2 0 0 0 12 9Z"/>
          </svg>
        </button>
        <span class="sr-only" aria-live="polite"></span>
      </div>
      <aside class="chat-panel" data-visible="false" aria-hidden="true" aria-label="Barkan chat">
        <button class="chat-panel__resize-handle" type="button" aria-label="Resize chat panel" title="Resize chat panel"></button>
        <div class="chat-panel__header">
          <div class="chat-panel__header-actions">
            <button class="chat-panel__close" type="button" aria-label="Close chat" title="Close chat">
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="m6.7 5.64 5.3 5.3 5.3-5.3 1.06 1.06-5.3 5.3 5.3 5.3-1.06 1.06-5.3-5.3-5.3 5.3-1.06-1.06 5.3-5.3-5.3-5.3 1.06-1.06Z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="chat-panel__thread">
          <div class="chat-panel__empty" data-visible="true">
            <strong>Hi there</strong>
            <div class="chat-panel__empty-mode">
              <div class="barkan-mode-picker chat-panel__empty-mode-control" data-picker="empty" data-open="false">
                <button class="barkan-mode-picker__button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="barkan-empty-mode-menu" aria-label="Choose Barkan mode" title="Choose Barkan mode">
                  <span class="barkan-mode-picker__label">Ask</span>
                </button>
                <svg class="barkan-mode-picker__chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5 6 7.5l3-3"/>
                </svg>
                <div class="barkan-mode-picker__menu" id="barkan-empty-mode-menu" role="listbox" aria-label="Choose Barkan mode">
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="true" data-mode="show" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Ask</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="act" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Do</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="automation" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Automate</span>
                  </button>
                </div>
              </div>
              <span class="chat-panel__empty-mode-suffix">Barkan anything.</span>
            </div>
          </div>
          <ul class="chat-panel__messages" aria-live="polite"></ul>
        </div>
        <form class="text-entry" data-action-mode="false" data-mode="show" data-has-question="false">
          <label class="sr-only" for="barkan-chat-input">Chat message</label>
          <div class="text-entry__choices" data-visible="false"></div>
          <div class="text-entry__body">
            <textarea id="barkan-chat-input" class="text-entry__input" autocomplete="off" enterkeyhint="send" rows="1" placeholder="Ask Barkan" aria-label="Type your question for Barkan"></textarea>
          </div>
          <div class="text-entry__footer">
            <span class="text-entry__attach" aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 21 21">
                <path fill="currentColor" d="M16.63 9.63h-5.25V4.38a.88.88 0 1 0-1.75 0v5.25H4.38a.88.88 0 1 0 0 1.75h5.25v5.25a.88.88 0 1 0 1.75 0v-5.25h5.25a.88.88 0 1 0 0-1.75Z"/>
              </svg>
            </span>
            <div class="text-entry__actions">
              <div class="barkan-mode-picker text-entry__mode" data-picker="composer" data-open="false">
                <button class="barkan-mode-picker__button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="barkan-composer-mode-menu" aria-label="Choose Barkan mode" title="Choose Barkan mode">
                  <span class="barkan-mode-picker__label">Show</span>
                </button>
                <svg class="barkan-mode-picker__chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5 6 7.5l3-3"/>
                </svg>
                <div class="barkan-mode-picker__menu" id="barkan-composer-mode-menu" role="listbox" aria-label="Choose Barkan mode">
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="true" data-mode="show" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Show</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="act" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Act</span>
                  </button>
                  <button class="barkan-mode-picker__option" type="button" role="option" aria-selected="false" data-mode="automation" tabindex="-1">
                    <svg class="barkan-mode-picker__check" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M3.2 8.3 6.4 11.5 12.8 4.8"/>
                    </svg>
                    <span class="barkan-mode-picker__option-label">Automation</span>
                  </button>
                </div>
              </div>
              <button class="text-entry__send" type="submit" data-input-empty="true" aria-label="Start voice chat" title="Voice">
                <svg class="text-entry__send-icon" preserveAspectRatio="none" width="100%" height="100%" overflow="visible" viewBox="0 0 19 19" fill="none" aria-hidden="true">
                  <path d="M9.5 16.5V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3.96094 8.54167L9.5026 3L15.0443 8.54167" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg class="text-entry__voice-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 10v4M9.7 6.5v11M14.3 8.8v6.4M19 10v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
                </svg>
                <span class="text-entry__stop-icon" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </form>
      </aside>
      <div class="agent" data-visible="false" data-placement="below-right" aria-hidden="true">
        <div class="agent-pointer">
          <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M7.5 4.8C6.3 3.8 4.5 4.9 5 6.4l8.6 28c.5 1.6 2.7 1.8 3.5.3l4.6-8.6c.3-.5.7-.9 1.2-1.1l8.8-3.9c1.5-.7 1.5-2.9-.1-3.6L7.5 4.8Z" fill="#ff6b00" stroke="#ffffff" stroke-width="3.2" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="agent-bubble" data-empty="true"></div>
      </div>
    `;
    this.launcherButton = shadowRoot.querySelector(".launcher-button") as HTMLButtonElement;
    this.callControl = shadowRoot.querySelector(".call-control") as HTMLDivElement;
    this.micButton = shadowRoot.querySelector(".mic-button") as HTMLButtonElement;
    this.textQuestionForm = shadowRoot.querySelector(".text-entry") as HTMLFormElement;
    this.textQuestionInput = shadowRoot.querySelector(".text-entry__input") as HTMLTextAreaElement;
    this.textQuestionSendButton = shadowRoot.querySelector(".text-entry__send") as HTMLButtonElement;
    this.actionChoiceContainer = shadowRoot.querySelector(".text-entry__choices") as HTMLDivElement;
    this.chatPanel = shadowRoot.querySelector(".chat-panel") as HTMLDivElement;
    this.chatResizeHandle = shadowRoot.querySelector(".chat-panel__resize-handle") as HTMLButtonElement;
    this.chatCloseButton = shadowRoot.querySelector(".chat-panel__close") as HTMLButtonElement;
    this.chatMessageList = shadowRoot.querySelector(".chat-panel__messages") as HTMLUListElement;
    this.chatEmptyState = shadowRoot.querySelector(".chat-panel__empty") as HTMLDivElement;
    this.chatEmptyModePicker = shadowRoot.querySelector('[data-picker="empty"]') as HTMLDivElement;
    this.chatEmptyModeButton = this.chatEmptyModePicker.querySelector(".barkan-mode-picker__button") as HTMLButtonElement;
    this.chatEmptyModeLabel = this.chatEmptyModePicker.querySelector(".barkan-mode-picker__label") as HTMLSpanElement;
    this.chatEmptyModeOptions = Array.from(
      this.chatEmptyModePicker.querySelectorAll<HTMLButtonElement>(".barkan-mode-picker__option")
    );
    this.chatEmptyModeSuffix = shadowRoot.querySelector(".chat-panel__empty-mode-suffix") as HTMLSpanElement;
    this.textQuestionModePicker = shadowRoot.querySelector('[data-picker="composer"]') as HTMLDivElement;
    this.textQuestionModeButton = this.textQuestionModePicker.querySelector(".barkan-mode-picker__button") as HTMLButtonElement;
    this.textQuestionModeLabel = this.textQuestionModePicker.querySelector(".barkan-mode-picker__label") as HTMLSpanElement;
    this.textQuestionModeOptions = Array.from(
      this.textQuestionModePicker.querySelectorAll<HTMLButtonElement>(".barkan-mode-picker__option")
    );
    this.hangupButton = shadowRoot.querySelector(".hangup-button") as HTMLButtonElement;
    this.callStatus = shadowRoot.querySelector(".sr-only") as HTMLSpanElement;
    this.agent = shadowRoot.querySelector(".agent") as HTMLDivElement;
    this.agentPointer = shadowRoot.querySelector(".agent-pointer") as HTMLDivElement;
    this.agentBubble = shadowRoot.querySelector(".agent-bubble") as HTMLDivElement;
    this.waveformBars = Array.from(shadowRoot.querySelectorAll<HTMLSpanElement>(".waveform-bar"));
    this.waveformCurrentScales = this.waveformBars.map(() => WAVEFORM_BASE_SCALE);
    this.waveformTargetScales = this.waveformBars.map(() => WAVEFORM_BASE_SCALE);
    this.setChatSidebarWidth(this.chatSidebarWidth, { updateLayout: false });

    this.launcherButton.addEventListener("click", () => void this.openChatFromLauncher());
    this.micButton.addEventListener("click", () => this.toggleMute());
    this.chatResizeHandle.addEventListener("pointerdown", this.onChatResizePointerDown);
    this.chatCloseButton.addEventListener("click", () => void this.closeChatToLauncher());
    this.textQuestionModeButton.addEventListener("click", () => this.toggleModePicker("composer"));
    this.chatEmptyModeButton.addEventListener("click", () => this.toggleModePicker("empty"));
    this.textQuestionModeButton.addEventListener("keydown", (event) => this.handleModePickerButtonKeyDown(event, "composer"));
    this.chatEmptyModeButton.addEventListener("keydown", (event) => this.handleModePickerButtonKeyDown(event, "empty"));
    for (const option of [...this.textQuestionModeOptions, ...this.chatEmptyModeOptions]) {
      option.addEventListener("click", () => this.chooseModePickerOption(option));
      option.addEventListener("keydown", (event) => this.handleModePickerOptionKeyDown(event, option));
    }
    shadowRoot.addEventListener("pointerdown", (event) => this.closeModePickerFromShadowEvent(event));
    document.addEventListener("pointerdown", this.closeModePickerFromDocumentEvent);
    this.textQuestionForm.addEventListener("submit", (event) => this.submitTypedQuestion(event));
    this.textQuestionInput.addEventListener("input", () => this.updateChatComposer());
    this.textQuestionInput.addEventListener("keydown", (event) => this.handleTextQuestionKeyDown(event));
    this.hangupButton.addEventListener("click", () => void this.endCall());
    this.updateTextModeUi();
  }

  async start() {
    document.documentElement.appendChild(this.root);
    window.__BARKAN_DEBUG__ = {
      ...(window.__BARKAN_DEBUG__ ?? {}),
      widgetBuildId: WIDGET_BUILD_ID
    };

    try {
      const configResponse = await fetch(
        `${this.apiBaseUrl}/api/widget/config?siteKey=${encodeURIComponent(this.siteKey)}`,
        { credentials: "omit" }
      );

      if (!configResponse.ok) {
        throw new Error("widget config failed");
      }

      this.config = (await configResponse.json()) as WidgetConfig;
      this.apiBaseUrl = normalizeWidgetApiBaseUrl(this.config.apiBaseUrl || this.scriptOrigin);
      this.applyChatTheme(this.config.site.chatTheme);

      if (this.config.domainWarning) {
        console.warn("Barkan domain warning: this origin does not match the configured site domain.");
      }
    } catch {
      this.showError("barkan setup failed");
      return;
    }

    window.addEventListener("mousemove", this.onWindowMouseMove, { passive: true });
    window.addEventListener("resize", this.onWindowResize, { passive: true });
    window.addEventListener("pagehide", this.onPageHide);
    this.clearPersistedCallState();
    this.updateLauncherVisibility();
    this.prefetchRealtimeTokens();
  }

  private applyChatTheme(theme: unknown) {
    this.root.dataset.barkanChatTheme = theme === "light" || theme === "dark" ? theme : "system";
  }

  private readonly onPageHide = () => {
    this.persistCallState();
    this.clearChatSidebarPageResize({ immediate: true });
  };

  private readonly onWindowMouseMove = (event: MouseEvent) => {
    this.lastMousePosition = { x: event.clientX, y: event.clientY };
    this.updateAgentPointerHover(event.clientX, event.clientY);
  };

  private readonly onWindowResize = () => {
    this.setChatSidebarWidth(this.chatSidebarWidth, { updateLayout: false });
    if (this.isTextModeActive) {
      this.applyChatSidebarPageResize();
    }
  };

  private readonly onChatResizePointerDown = (event: PointerEvent) => {
    if (!this.isTextModeActive || window.innerWidth < 760) {
      return;
    }

    event.preventDefault();
    this.isChatSidebarResizing = true;
    this.chatPanel.dataset.resizing = "true";
    this.chatResizeHandle.setPointerCapture?.(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", this.onChatResizePointerMove);
    window.addEventListener("pointerup", this.onChatResizePointerUp);
    window.addEventListener("pointercancel", this.onChatResizePointerUp);
  };

  private readonly onChatResizePointerMove = (event: PointerEvent) => {
    if (!this.isChatSidebarResizing) {
      return;
    }

    event.preventDefault();
    this.setChatSidebarWidth(window.innerWidth - event.clientX);
  };

  private readonly onChatResizePointerUp = () => {
    if (!this.isChatSidebarResizing) {
      return;
    }

    this.isChatSidebarResizing = false;
    this.chatPanel.dataset.resizing = "false";
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", this.onChatResizePointerMove);
    window.removeEventListener("pointerup", this.onChatResizePointerUp);
    window.removeEventListener("pointercancel", this.onChatResizePointerUp);
    this.applyChatSidebarPageResize();
  };

  private persistCallState() {
    if (!this.isCallActive) {
      return;
    }

    try {
      const state: PersistedCallState = {
        version: 1,
        siteKey: this.siteKey,
        savedAt: Date.now(),
        navigationContext: this.navigationContext,
        lastOpenAIResponseId: this.lastOpenAIResponseId,
        isMuted: this.isMuted,
        textEntryMode: this.textEntryMode
      };
      window.sessionStorage.setItem(this.callPersistenceKey, JSON.stringify(state));
    } catch {
    }
  }

  private clearPersistedCallState() {
    try {
      window.sessionStorage.removeItem(this.callPersistenceKey);
    } catch {
    }
  }

  private get callPersistenceKey(): string {
    return `barkan:call:${this.siteKey}`;
  }

  private readPersistedTextEntryMode(): TextEntryMode {
    try {
      const value = window.localStorage.getItem(this.modePreferenceKey) ?? "";
      return isTextEntryMode(value) ? value : "show";
    } catch {
      return "show";
    }
  }

  private persistTextEntryMode(mode: TextEntryMode) {
    try {
      window.localStorage.setItem(this.modePreferenceKey, mode);
    } catch {
    }
  }

  private get modePreferenceKey(): string {
    return `barkan:mode:${this.siteKey}`;
  }

  private async startCall(options: { resume?: boolean; openChat?: boolean; silentGreeting?: boolean } = {}) {
    if (!this.config || this.isCallActive) {
      return;
    }

    this.primeBrowserAudio();
    const sessionId = ++this.callSessionId;
    this.isCallActive = true;
    if (!options.resume) {
      this.isMuted = false;
      this.setTextEntryMode(this.preferredTextEntryMode, { persistPreference: false });
      this.clearActionModeState();
      this.lastOpenAIResponseId = null;
      this.pendingOpenAIResponseId = null;
      this.pendingClarificationContext = null;
    }
    this.setTextModeActive(options.openChat === true, { clearInput: !options.resume });
    this.turnQueue.clear();
    this.actionQueue.clear();
    this.activeOpenAIAbortController?.abort();
    this.activeOpenAIAbortController = null;
    this.activeActionAbortController?.abort();
    this.activeActionAbortController = null;
    this.stopSpeakingAudio();
    this.currentAssistantSpeech = "";
    if (!options.resume) {
      this.chatMessages = [];
      this.expandedChatActivityMessageIds.clear();
      this.isChatThinking = false;
      this.chatThinkingText = "Thinking";
      this.chatThinkingTargetText = "Thinking";
      this.clearChatThinkingTransition();
      this.renderChatMessages();
      this.navigationContext = null;
    }
    this.hideAgent();
    this.setState("connecting", "connecting");
    this.persistCallState();

    if (this.isMuted) {
      this.recordDebugEvent("microphone-start-skipped-muted");
      this.setState("muted", "muted");
      this.startMicrophoneHealthMonitor();
      this.completeCallStart(sessionId, options);
      return;
    }

    let stream: MediaStream;
    try {
      if (!this.hasShownMicConsent && !(await hasGrantedMicrophonePermission())) {
        this.hasShownMicConsent = true;
      }

      stream = await this.getMicrophoneStream();
      this.activeMicrophoneStream = stream;
      this.recordDebugEvent("microphone-stream-ready");
      this.watchMicrophoneTrackEnd(stream, sessionId);
      if (!this.isCurrentSession(sessionId)) {
        this.stopMicrophoneStream();
        return;
      }
    } catch (error) {
      if (!this.isCurrentSession(sessionId)) {
        return;
      }
      this.isCallActive = false;
      this.setTextModeActive(false, { clearInput: true });
      this.clearPersistedCallState();
      this.clearPrimedAudioResources();
      this.recordDebugEvent("microphone-start-failed", getErrorMessage(error));
      this.showError("microphone blocked");
      return;
    }

    try {
      const token = await this.consumeSttToken();
      this.recordDebugEvent("stt-token-ready");

      this.activeTranscriber = new RealtimeTranscriber(
        token,
        stream,
        this.buildTranscriberCallbacks(sessionId),
        this.consumePrimedInputAudioContext()
      );
      await this.activeTranscriber.start();
      if (!this.isCurrentSession(sessionId)) {
        this.activeTranscriber.stop();
        return;
      }
      this.recordDebugEvent("transcriber-started");
      this.applyMicrophoneCaptureState();
      this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
      this.startMicrophoneHealthMonitor();
      this.completeCallStart(sessionId, options);
    } catch (error) {
      if (!this.isCurrentSession(sessionId)) {
        return;
      }
      this.isCallActive = false;
      this.setTextModeActive(false, { clearInput: true });
      this.clearPersistedCallState();
      this.activeTranscriber = null;
      this.clearPrimedAudioResources();
      this.stopMicrophoneStream();
      console.warn("[Barkan] voice setup failed", error);
      this.recordDebugEvent("voice-setup-failed", getErrorMessage(error));
      this.showError("voice service not ready");
    }
  }

  private completeCallStart(
    sessionId: number,
    options: { resume?: boolean; openChat?: boolean; silentGreeting?: boolean }
  ) {
    if (!this.isCurrentSession(sessionId)) {
      return;
    }

    if (options.resume) {
      this.recordDebugEvent("call-resumed");
      if (this.navigationContext) {
        const navigationContext = this.navigationContext;
        this.navigationContext = null;
        this.persistCallState();
        window.setTimeout(() => {
          this.turnQueue.enqueue({
            sessionId,
            transcript: navigationContext.originalPrompt,
            historyTranscript: navigationContext.originalPrompt,
            scrollRetryCount: 0,
            navigationContext
          });
        }, 250);
      }
    } else if (!options.silentGreeting) {
      void this.speakLocalGreeting(sessionId);
    }
  }

  private async endCall() {
    this.recordDebugEvent("end-call");
    this.callSessionId++;
    this.isCallActive = false;
    this.clearPersistedCallState();
    this.isMuted = false;
    this.clearActionModeState();
    this.lastOpenAIResponseId = null;
    this.pendingOpenAIResponseId = null;
    this.pendingClarificationContext = null;
    this.setTextModeActive(false, { clearInput: true });
    this.turnQueue.clear();
    this.actionQueue.clear();
    this.clearAutomationTimers();
    this.automationAuthorizationMessageId = null;
    this.cancelPendingGuidanceClick();
    this.activeOpenAIAbortController?.abort();
    this.activeOpenAIAbortController = null;
    this.activeActionAbortController?.abort();
    this.activeActionAbortController = null;
    this.stopSpeakingAudio();
    this.currentAssistantSpeech = "";
    this.recentAssistantSpeech = [];
    this.chatMessages = [];
    this.expandedChatActivityMessageIds.clear();
    this.isChatThinking = false;
    this.chatThinkingText = "Thinking";
    this.chatThinkingTargetText = "Thinking";
    this.clearChatThinkingTransition();
    this.navigationContext = null;
    this.microphoneRecoveryPromise = null;
    this.stopMicrophoneHealthMonitor();
    this.clearPrimedAudioResources();
    this.activeTranscriber?.stop();
    this.activeTranscriber = null;
    this.stopMicrophoneStream();
    this.hideAgent();
    this.renderChatMessages();
    this.setState("idle", "");
  }

  private handleCommittedTranscript(
    sessionId: number,
    transcript: string,
    options: {
      answeredQuestions?: boolean;
      originalTranscript?: string;
      previousResponseId?: string | null;
      questionToolCallId?: string;
      suppressFurtherQuestions?: boolean;
      silentResponse?: boolean;
      trustedUserInput?: boolean;
      suppressUserMessage?: boolean;
    } = {}
  ) {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript || !this.isCurrentSession(sessionId)) {
      return;
    }

    if (!options.trustedUserInput && this.isLikelySelfEchoTranscript(trimmedTranscript)) {
      window.__BARKAN_DEBUG__ = {
        ...(window.__BARKAN_DEBUG__ ?? {}),
        lastIgnoredTranscript: trimmedTranscript
      };
      return;
    }

    if (!options.trustedUserInput && this.isRecentlyHandledUserTranscript(trimmedTranscript)) {
      window.__BARKAN_DEBUG__ = {
        ...(window.__BARKAN_DEBUG__ ?? {}),
        lastIgnoredTranscript: trimmedTranscript
      };
      return;
    }

    this.resetPerMessageContextForFreshUserInput();
    if (options.answeredQuestions !== true) {
      this.pendingClarificationContext = null;
    }
    this.rememberUserTranscript(trimmedTranscript);
    if (options.suppressUserMessage !== true) {
      this.appendChatMessage("user", trimmedTranscript, { allowDuplicate: options.trustedUserInput === true });
    }

    this.persistCallState();

    this.turnQueue.enqueue({
      sessionId,
      transcript: trimmedTranscript,
      historyTranscript: options.originalTranscript?.trim() || trimmedTranscript,
      previousResponseId: options.previousResponseId ?? this.lastOpenAIResponseId,
      questionToolCallId: options.questionToolCallId,
      suppressFurtherQuestions: options.suppressFurtherQuestions === true,
      scrollRetryCount: 0,
      silentResponse: options.silentResponse === true,
      answeredQuestions: options.answeredQuestions === true
    });
  }

  private async toggleCallMode() {
    if (this.isCallActive && !this.isTextModeActive) {
      this.recordDebugEvent("shortcut-end-call");
      await this.endCall();
      return;
    }

    this.recordDebugEvent("shortcut-start-call");
    if (!this.isCallActive) {
      await this.startCall();
      return;
    }

    this.setTextModeActive(false);
    this.isMuted = false;
    this.applyMicrophoneCaptureState();
    if (this.state === "muted" || this.state === "listening") {
      this.setState("listening", "listening");
    }
    this.persistCallState();
  }

  private async openChatFromLauncher() {
    if (this.isLauncherBusy || this.isTextModeActive || this.isCallActive) {
      return;
    }

    this.setLauncherBusy(true);
    try {
      await this.startCall({ openChat: true, silentGreeting: true });
    } finally {
      this.setLauncherBusy(false);
    }
  }

  private async closeChatToLauncher() {
    if (!this.isCallActive && !this.isTextModeActive) {
      return;
    }

    await this.endCall();
    this.launcherButton.focus();
  }

  private async openCallFromChat() {
    if (this.isChatCallBusy) {
      return;
    }

    this.setChatCallBusy(true);
    try {
      if (!this.isCallActive) {
        await this.startCall({ silentGreeting: true });
        return;
      }

      this.recordDebugEvent("chat-open-call");
      this.setTextModeActive(false);
      this.isMuted = false;
      this.setState("connecting", "connecting");
      await this.recoverMicrophonePipeline("unmute");
      if (this.isCallActive && !this.isMuted && this.state !== "error") {
        this.applyMicrophoneCaptureState();
        this.setState("listening", "listening");
      }
      this.persistCallState();
    } finally {
      this.setChatCallBusy(false);
    }
  }

  private async toggleChatMode() {
    if (this.isTextModeActive) {
      await this.endCall();
      return;
    }

    if (!this.isCallActive) {
      await this.startCall({ openChat: true, silentGreeting: true });
      return;
    }

    this.recordDebugEvent("shortcut-open-chat");
    if (this.activeOpenAIAbortController) {
      this.isSpeechInterruptedByUser = true;
      this.activeOpenAIAbortController.abort();
      this.activeOpenAIAbortController = null;
      this.setChatThinking(false);
    }
    this.stopSpeakingAudio();
    this.currentAssistantSpeech = "";
    this.setTextModeActive(true);
  }

  private setTextModeActive(isActive: boolean, options: { clearInput?: boolean } = {}) {
    if (isActive && !this.isCallActive) {
      return;
    }

    if (!isActive) {
      this.actionQueue.clear();
      this.activeActionAbortController?.abort();
      this.activeActionAbortController = null;
      this.clearAutomationTimers();
      this.automationAuthorizationMessageId = null;
      this.clearActionModeState();
    }

    this.isTextModeActive = isActive;
    this.isActionModeActive = isActive && this.textEntryMode === "act";
    if (isActive) {
      this.isMuted = true;
      this.applyMicrophoneCaptureState();
      if (this.state === "listening" || this.state === "muted") {
        this.setState("muted", "muted");
      }
      window.setTimeout(() => {
        if (this.isTextModeActive && this.isCallActive) {
          this.textQuestionInput.focus();
          this.updateChatComposer();
        }
      }, 0);
    }

    if (options.clearInput) {
      this.textQuestionInput.value = "";
      this.updateChatComposer();
    }
    if (!isActive && this.textQuestionInput === this.root.shadowRoot?.activeElement) {
      this.textQuestionInput.blur();
    }
    if (isActive) {
      this.applyChatSidebarPageResize();
    } else {
      this.clearChatSidebarPageResize();
    }
    this.updateTextModeUi();
  }

  private submitTypedQuestion(event: SubmitEvent) {
    event.preventDefault();
    if (!this.isCallActive) {
      return;
    }

    if (this.isChatThinking) {
      this.stopCurrentGeneration();
      return;
    }

    const typedQuestion = this.textQuestionInput.value.trim();
    if (!typedQuestion) {
      void this.openCallFromChat();
      return;
    }

    this.textQuestionInput.value = "";
    this.updateChatComposer();
    if (this.shouldRouteTypedInputToQuestionFlow(typedQuestion)) {
      this.clearActionChoices();
      this.isMuted = true;
      this.applyMicrophoneCaptureState();
      if (this.state === "listening" || this.state === "muted") {
        this.setState("muted", "muted");
      }
      this.recordDebugEvent("typed-question-submit");
      this.handleCommittedTranscript(this.callSessionId, typedQuestion, { silentResponse: true, trustedUserInput: true });
    } else if (this.textEntryMode === "act") {
      this.clearActionChoices();
      this.recordDebugEvent("typed-action-submit");
      this.appendChatMessage("user", typedQuestion, { allowDuplicate: true });
      this.appendGoalConversationEntry("user", typedQuestion);
      this.actionQueue.enqueue({ sessionId: this.callSessionId, userMessage: typedQuestion });
    } else if (this.textEntryMode === "automation") {
      this.clearActionChoices();
      this.recordDebugEvent("typed-automation-submit");
      this.appendChatMessage("user", typedQuestion, { allowDuplicate: true });
      this.startAutomationBlueprintSequence();
    } else {
      this.clearActionChoices();
      this.isMuted = true;
      this.applyMicrophoneCaptureState();
      if (this.state === "listening" || this.state === "muted") {
        this.setState("muted", "muted");
      }
      this.recordDebugEvent("typed-question-submit");
      this.handleCommittedTranscript(this.callSessionId, typedQuestion, { silentResponse: true, trustedUserInput: true });
    }
    this.updateTextModeUi();
    this.textQuestionInput.focus();
  }

  private shouldRouteTypedInputToQuestionFlow(text: string) {
    const normalizedText = text.trim().toLowerCase();
    return /\bask\s+(?:me|us)\b/.test(normalizedText) && /\bquestions?\b/.test(normalizedText);
  }

  private startAutomationBlueprintSequence() {
    const sequenceId = ++this.automationSequenceId;
    this.clearAutomationTimers();
    this.automationAuthorizationMessageId = null;
    this.setChatThinking(true, "Thinking");
    this.setState("thinking", "thinking");
    this.queueAutomationStep(sequenceId, 1_900, () => {
      this.setChatThinking(false);
      this.appendStreamingAssistantMessage("Calling Gmail authorization tool.", {
        allowDuplicate: true,
        presentation: "thinking"
      });
      this.setState("thinking", "calling tool");
    });
    this.queueAutomationStep(sequenceId, 4_600, () => {
      this.settleActiveThinkingMessages();
      this.appendStreamingAssistantMessage("Building your blueprint.", {
        allowDuplicate: true,
        presentation: "thinking"
      });
      this.setState("thinking", "building blueprint");
    });
    this.queueAutomationStep(sequenceId, AUTOMATION_PRE_AUTH_SEQUENCE_MS, () => {
      this.openAutomationAuthorizationDialog();
    });
  }

  private queueAutomationStep(sequenceId: number, delayMs: number, callback: () => void) {
    const timerId = window.setTimeout(() => {
      this.automationTimers = this.automationTimers.filter((timer) => timer !== timerId);
      if (sequenceId !== this.automationSequenceId || !this.isCallActive) {
        return;
      }
      callback();
    }, delayMs);
    this.automationTimers.push(timerId);
  }

  private clearAutomationTimers() {
    for (const timerId of this.automationTimers) {
      window.clearTimeout(timerId);
    }
    this.automationTimers = [];
  }

  private openAutomationAuthorizationDialog() {
    this.settleActiveThinkingMessages();
    this.setChatThinking(false);
    this.automationAuthorizationMessageId = this.appendChatMessage("assistant", "Need your authorization to continue.", {
      allowDuplicate: true,
      presentation: "authorization"
    });
  }

  private async authorizeAutomationGmail(button?: HTMLButtonElement) {
    if (button?.disabled) {
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Authorizing...";
    }

    this.setChatThinking(true, "Authorizing Gmail");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));

    if (!this.isCallActive) {
      return;
    }

    this.setChatThinking(false);
    if (button) {
      button.textContent = "Authorized";
    }
    this.appendStreamingAssistantMessage("Gmail authorized.", { allowDuplicate: true });
    this.finishAutomationBlueprintDeployment();
  }

  private finishAutomationBlueprintDeployment() {
    const sequenceId = ++this.automationSequenceId;
    this.clearAutomationTimers();
    this.setState("thinking", "deploying your blueprint");
    this.setChatThinking(true, "Deploying your blueprint");
    this.queueAutomationStep(sequenceId, AUTOMATION_POST_AUTH_SEQUENCE_MS, () => {
      this.setChatThinking(false);
      this.appendStreamingAssistantMessage("Your blueprint is deployed.", { allowDuplicate: true });
      this.setState("muted", "blueprint deployed");
    });
  }

  private handleTextQuestionKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.textQuestionForm.requestSubmit();
      return;
    }

    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    void this.closeChatToLauncher();
  }

  private toggleModePicker(placement: ModePickerPlacement) {
    if (!this.isCallActive || !this.isTextModeActive) {
      return;
    }

    if (this.openModePicker === placement) {
      this.closeModePicker();
      return;
    }

    this.openModePickerMenu(placement);
  }

  private openModePickerMenu(placement: ModePickerPlacement, focusSelectedOption = false) {
    if (!this.isCallActive || !this.isTextModeActive) {
      return;
    }

    this.openModePicker = placement;
    this.syncModePickerOpenState();
    if (focusSelectedOption) {
      this.focusSelectedModeOption(placement);
    }
  }

  private closeModePicker({ restoreFocus = false } = {}) {
    const previouslyOpenPicker = this.openModePicker;
    this.openModePicker = null;
    this.syncModePickerOpenState();

    if (restoreFocus && previouslyOpenPicker) {
      this.getModePickerButton(previouslyOpenPicker).focus();
    }
  }

  private chooseModePickerOption(option: HTMLButtonElement) {
    const placement = this.getModePickerPlacementForOption(option);
    const optionMode = option.dataset.mode ?? "";
    const nextMode = isTextEntryMode(optionMode) ? optionMode : "show";
    this.closeModePicker();
    if (nextMode === this.textEntryMode) {
      if (placement) {
        this.getModePickerButton(placement).focus();
      }
      return;
    }

    this.changeTextEntryMode(nextMode);
  }

  private handleModePickerButtonKeyDown(event: KeyboardEvent, placement: ModePickerPlacement) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    this.openModePickerMenu(placement, true);
  }

  private handleModePickerOptionKeyDown(event: KeyboardEvent, option: HTMLButtonElement) {
    const placement = this.getModePickerPlacementForOption(option);
    if (!placement) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.closeModePicker({ restoreFocus: true });
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.chooseModePickerOption(option);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      this.focusModePickerOption(placement, option, event.key);
    }
  }

  private closeModePickerFromShadowEvent(event: Event) {
    if (!this.openModePicker) {
      return;
    }

    const activePicker = this.getModePicker(this.openModePicker);
    if (!event.composedPath().includes(activePicker)) {
      this.closeModePicker();
    }
  }

  private closeModePickerFromDocumentEvent = (event: Event) => {
    if (!this.openModePicker || event.composedPath().includes(this.root)) {
      return;
    }

    this.closeModePicker();
  };

  private syncModePickerOpenState() {
    for (const placement of ["empty", "composer"] as const) {
      const isOpen = this.openModePicker === placement;
      this.getModePicker(placement).dataset.open = isOpen ? "true" : "false";
      this.getModePickerButton(placement).setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  }

  private syncModePickerSelection() {
    this.chatEmptyModeLabel.textContent = getModePickerLabel(this.textEntryMode, "empty");
    this.textQuestionModeLabel.textContent = getModePickerLabel(this.textEntryMode, "composer");

    for (const option of [...this.chatEmptyModeOptions, ...this.textQuestionModeOptions]) {
      option.setAttribute("aria-selected", option.dataset.mode === this.textEntryMode ? "true" : "false");
    }
  }

  private focusSelectedModeOption(placement: ModePickerPlacement) {
    const selectedOption =
      this.getModePickerOptions(placement).find((option) => option.dataset.mode === this.textEntryMode) ??
      this.getModePickerOptions(placement)[0];
    selectedOption?.focus();
  }

  private focusModePickerOption(placement: ModePickerPlacement, currentOption: HTMLButtonElement, key: string) {
    const options = this.getModePickerOptions(placement);
    const currentIndex = Math.max(0, options.indexOf(currentOption));
    const lastIndex = options.length - 1;
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? lastIndex
          : key === "ArrowUp"
            ? (currentIndex - 1 + options.length) % options.length
            : (currentIndex + 1) % options.length;

    options[nextIndex]?.focus();
  }

  private getModePickerPlacementForOption(option: HTMLButtonElement): ModePickerPlacement | null {
    const picker = option.closest<HTMLElement>("[data-picker]");
    return picker?.dataset.picker === "empty" || picker?.dataset.picker === "composer" ? picker.dataset.picker : null;
  }

  private getModePicker(placement: ModePickerPlacement): HTMLDivElement {
    return placement === "empty" ? this.chatEmptyModePicker : this.textQuestionModePicker;
  }

  private getModePickerButton(placement: ModePickerPlacement): HTMLButtonElement {
    return placement === "empty" ? this.chatEmptyModeButton : this.textQuestionModeButton;
  }

  private getModePickerOptions(placement: ModePickerPlacement): HTMLButtonElement[] {
    return placement === "empty" ? this.chatEmptyModeOptions : this.textQuestionModeOptions;
  }

  private updateTextModeUi() {
    const isVisible = this.isCallActive && this.isTextModeActive;
    if (!isVisible) {
      this.closeModePicker();
    }
    this.callControl.dataset.textMode = this.isTextModeActive ? "true" : "false";
    this.updateCallControlVisibility();
    this.textQuestionForm.dataset.actionMode = this.isActionModeActive ? "true" : "false";
    this.textQuestionForm.dataset.mode = this.textEntryMode;
    this.chatEmptyState.dataset.mode = this.textEntryMode;
    this.syncModePickerSelection();
    this.syncModePickerOpenState();
    this.chatEmptyModeSuffix.textContent = getEmptyModeSuffix(this.textEntryMode);
    this.chatPanel.dataset.visible = isVisible ? "true" : "false";
    this.chatPanel.setAttribute("aria-hidden", isVisible ? "false" : "true");
    this.textQuestionInput.tabIndex = isVisible ? 0 : -1;
    this.textQuestionSendButton.tabIndex = isVisible ? 0 : -1;
    this.textQuestionModeButton.tabIndex = isVisible ? 0 : -1;
    this.chatEmptyModeButton.tabIndex = isVisible ? 0 : -1;
    this.chatCloseButton.tabIndex = isVisible ? 0 : -1;
    this.updateChatComposer();
    this.renderChatMessages();
    this.updateLauncherVisibility();
  }

  private setLauncherBusy(isBusy: boolean) {
    this.isLauncherBusy = isBusy;
    this.launcherButton.dataset.busy = isBusy ? "true" : "false";
    this.launcherButton.disabled = isBusy;
    this.updateLauncherVisibility();
  }

  private setChatCallBusy(isBusy: boolean) {
    this.isChatCallBusy = isBusy;
    this.textQuestionSendButton.dataset.voiceBusy = isBusy ? "true" : "false";
    this.updateChatComposer();
  }

  private updateLauncherVisibility() {
    const shouldShowLauncher = !this.isCallActive && this.state !== "error";
    this.launcherButton.dataset.visible = shouldShowLauncher ? "true" : "false";
    this.launcherButton.setAttribute("aria-hidden", shouldShowLauncher ? "false" : "true");
    this.launcherButton.tabIndex = shouldShowLauncher ? 0 : -1;
  }

  private changeTextEntryMode(mode: string) {
    if (!this.isCallActive || !this.isTextModeActive) {
      return;
    }

    const nextMode = isTextEntryMode(mode) ? mode : "show";
    if (nextMode === this.textEntryMode) {
      return;
    }

    this.resetChatForModeChange();
    this.setTextEntryMode(nextMode);
    this.recordDebugEvent("text-entry-mode", this.textEntryMode);
    this.updateTextModeUi();
    this.textQuestionInput.focus();
  }

  private setTextEntryMode(mode: TextEntryMode, options: { persistPreference?: boolean } = {}) {
    this.textEntryMode = mode;
    if (options.persistPreference !== false) {
      this.preferredTextEntryMode = mode;
      this.persistTextEntryMode(mode);
    }
    this.isActionModeActive = this.isTextModeActive && mode === "act";
  }

  private resetChatForModeChange() {
    this.turnQueue.clear();
    this.actionQueue.clear();
    this.activeOpenAIAbortController?.abort();
    this.activeOpenAIAbortController = null;
    this.activeActionAbortController?.abort();
    this.activeActionAbortController = null;
    this.clearAutomationTimers();
    this.automationAuthorizationMessageId = null;
    this.clearActionModeState();
    this.chatMessages = [];
    this.expandedChatActivityMessageIds.clear();
    this.isChatThinking = false;
    this.chatThinkingText = "Thinking";
    this.chatThinkingTargetText = "Thinking";
    this.clearChatThinkingTransition();
    this.currentAssistantSpeech = "";
    this.recentAssistantSpeech = [];
    this.navigationContext = null;
    this.textQuestionInput.value = "";
    this.updateChatComposer();
    this.renderChatMessages();
  }

  private clearActionModeState() {
    this.goalRunState = null;
    this.goalConversationContext = [];
    this.clearActionChoices();
  }

  private clearActionChoices() {
    this.choicePrompts = [];
    this.choiceAnswerStates = [];
    this.activeChoicePromptIndex = 0;
    this.choicePromptMode = null;
    this.actionChoiceContainer.replaceChildren();
    this.actionChoiceContainer.dataset.visible = "false";
    this.textQuestionForm.dataset.hasQuestion = "false";
  }

  private renderChoicePrompts(prompts: ChoicePrompt[] = [], mode: ChoicePromptMode = "action") {
    const normalizedPrompts = prompts
      .map((prompt) => ({
        prompt: prompt.prompt.trim() || "What should Barkan do next?",
        choices: prompt.choices.slice(0, 4)
      }))
      .filter((prompt) => prompt.prompt.length > 0);

    this.choicePrompts = normalizedPrompts;
    this.choicePromptMode = normalizedPrompts.length > 0 ? mode : null;
    this.activeChoicePromptIndex = 0;
    this.choiceAnswerStates = normalizedPrompts.map((prompt) => ({
      selectedIndex: prompt.choices.length > 0 ? this.getDefaultChoiceIndex(prompt.choices) : 0,
      freeformValue: ""
    }));
    this.actionChoiceContainer.replaceChildren();

    if (normalizedPrompts.length === 0) {
      this.actionChoiceContainer.dataset.visible = "false";
      this.textQuestionForm.dataset.hasQuestion = "false";
      return;
    }

    this.actionChoiceContainer.dataset.visible = "true";
    this.textQuestionForm.dataset.hasQuestion = "true";
    this.renderActionChoicePanel({ animate: true, focus: true });
    this.updateTextModeUi();
  }

  private getDefaultChoiceIndex(choices: WidgetActionChoice[]) {
    const recommendedIndex = choices.findIndex((choice) => choice.recommended === true);
    return recommendedIndex >= 0 ? recommendedIndex : choices.length > 0 ? 0 : -1;
  }

  private getActiveChoicePrompt() {
    return this.choicePrompts[this.activeChoicePromptIndex] ?? null;
  }

  private getActiveChoiceAnswerState() {
    return this.choiceAnswerStates[this.activeChoicePromptIndex] ?? { selectedIndex: -1, freeformValue: "" };
  }

  private updateActiveChoiceAnswerState(nextState: ChoiceAnswerState) {
    this.choiceAnswerStates[this.activeChoicePromptIndex] = nextState;
  }

  private renderActionChoicePanel(renderOptions: { animate?: boolean; focus?: boolean } = {}) {
    const promptMode = this.choicePromptMode;
    const activePrompt = this.getActiveChoicePrompt();
    if (!promptMode || !activePrompt) {
      this.clearActionChoices();
      return;
    }

    this.actionChoiceContainer.replaceChildren();

    const panel = document.createElement("div");
    panel.className = "barkan-question-panel";
    panel.dataset.animate = renderOptions.animate === true ? "true" : "false";
    panel.tabIndex = 0;
    panel.role = "group";
    panel.setAttribute("aria-label", "Clarification question");
    panel.addEventListener("keydown", (event) => this.handleActionChoicePanelKeyDown(event));

    const header = document.createElement("div");
    header.className = "barkan-question-panel__header";

    const heading = document.createElement("div");
    heading.className = "barkan-question-panel__heading";
    const prompt = document.createElement("p");
    prompt.className = "barkan-question-panel__prompt";
    prompt.textContent = activePrompt.prompt;
    heading.appendChild(prompt);
    header.appendChild(heading);

    if (this.choicePrompts.length > 1) {
      const nav = document.createElement("div");
      nav.className = "barkan-question-panel__nav";

      const previousButton = document.createElement("button");
      previousButton.className = "barkan-question-panel__nav-button";
      previousButton.type = "button";
      previousButton.disabled = this.isChatThinking || this.activeChoicePromptIndex === 0;
      previousButton.setAttribute("aria-label", "Previous question");
      previousButton.innerHTML = `<svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true"><path d="M5.5 1L1 5.5L5.5 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      previousButton.addEventListener("click", () => this.moveToChoiceQuestion(-1));

      const progress = document.createElement("p");
      progress.className = "barkan-question-panel__progress";
      progress.textContent = `${this.activeChoicePromptIndex + 1} of ${this.choicePrompts.length}`;

      const nextButton = document.createElement("button");
      nextButton.className = "barkan-question-panel__nav-button";
      nextButton.type = "button";
      nextButton.disabled = this.isChatThinking || !this.canSubmitActionChoice();
      nextButton.setAttribute("aria-label", "Next question");
      nextButton.innerHTML = `<svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true"><path d="M1 1L5.5 5.5L1 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      nextButton.addEventListener("click", () => this.advanceOrSubmitActionChoice());

      nav.append(previousButton, progress, nextButton);
      header.appendChild(nav);
    }

    panel.appendChild(header);

    const options = document.createElement("div");
    options.className = "barkan-question-panel__options";
    this.getRenderableActionChoices().forEach((choice, index) => {
      options.appendChild(this.createActionChoiceOption(choice, index));
    });
    panel.appendChild(options);

    const footer = document.createElement("div");
    footer.className = "barkan-question-panel__footer";

    const dismiss = document.createElement("button");
    dismiss.className = "barkan-question-panel__dismiss";
    dismiss.type = "button";
    dismiss.disabled = this.isChatThinking;
    dismiss.addEventListener("click", () => {
      panel.blur();
    });
    const dismissText = document.createElement("span");
    dismissText.textContent = "Dismiss";
    const keycap = document.createElement("span");
    keycap.className = "barkan-question-panel__keycap";
    keycap.textContent = "ESC";
    dismiss.append(dismissText, keycap);

    const continueButton = document.createElement("button");
    continueButton.className = "barkan-question-panel__continue";
    continueButton.type = "button";
    continueButton.disabled = this.isChatThinking || !this.canSubmitActionChoice();
    continueButton.addEventListener("click", () => this.advanceOrSubmitActionChoice());
    const continueLabel = document.createElement("span");
    continueLabel.className = "barkan-question-panel__continue-label";
    continueLabel.textContent = "Continue";
    const continueIcon = document.createElement("span");
    continueIcon.className = "barkan-question-panel__continue-icon";
    continueIcon.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true"><path d="M6.66667 2L3 5.66667L1.33333 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    continueButton.append(continueLabel, continueIcon);

    footer.append(dismiss, continueButton);
    panel.appendChild(footer);
    this.actionChoiceContainer.appendChild(panel);
    if (renderOptions.focus !== false) {
      panel.focus({ preventScroll: true });
    }
  }

  private createActionChoiceOption(choice: WidgetActionChoice & { editable?: boolean }, index: number) {
    const activeAnswer = this.getActiveChoiceAnswerState();
    const freeformValue = activeAnswer.freeformValue.trim();
    const isSelected = index === activeAnswer.selectedIndex;
    const isEditable = choice.editable === true;
    const option = document.createElement("button");
    option.className = "barkan-question-panel__option";
    option.type = "button";
    option.dataset.selected = isSelected ? "true" : "false";
    option.dataset.editable = isEditable ? "true" : "false";
    option.disabled = this.isChatThinking;
    option.addEventListener("click", () => {
      this.updateActiveChoiceAnswerState({
        ...this.getActiveChoiceAnswerState(),
        selectedIndex: index
      });
      this.renderActionChoicePanel({ animate: false, focus: false });
    });

    const optionIndex = document.createElement("span");
    optionIndex.className = "barkan-question-panel__option-index";
    optionIndex.textContent = `${index + 1}.`;

    const optionMain = document.createElement("span");
    optionMain.className = "barkan-question-panel__option-main";

    if (isEditable && isSelected) {
      const input = document.createElement("textarea");
      input.className = "barkan-question-panel__option-input";
      input.placeholder = "Write what you want to tell Barkan";
      input.rows = 1;
      input.value = activeAnswer.freeformValue;
      input.disabled = this.isChatThinking;
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("input", () => {
        this.updateActiveChoiceAnswerState({
          ...this.getActiveChoiceAnswerState(),
          freeformValue: input.value
        });
        input.style.height = "0px";
        input.style.height = `${input.scrollHeight}px`;
        const continueButton = this.actionChoiceContainer.querySelector<HTMLButtonElement>(".barkan-question-panel__continue");
        if (continueButton) {
          continueButton.disabled = !this.canSubmitActionChoice();
        }
      });
      optionMain.appendChild(input);
      queueMicrotask(() => {
        input.focus();
        input.style.height = "0px";
        input.style.height = `${input.scrollHeight}px`;
      });
    } else {
      const label = document.createElement("span");
      label.className = "barkan-question-panel__option-label";
      label.textContent = isEditable && freeformValue ? freeformValue : choice.label;
      if (choice.recommended) {
        const recommended = document.createElement("span");
        recommended.textContent = " (Recommended)";
        label.appendChild(recommended);
      }
      optionMain.appendChild(label);
    }

    option.append(optionIndex, optionMain);

    if (isSelected) {
      const controls = document.createElement("span");
      controls.className = "barkan-question-panel__option-controls";
      controls.addEventListener("click", (event) => event.stopPropagation());
      controls.append(
        this.createActionChoiceMoveButton("up", index === 0),
        this.createActionChoiceMoveButton("down", index === this.getRenderableActionChoices().length - 1)
      );
      option.appendChild(controls);
    }

    return option;
  }

  private createActionChoiceMoveButton(direction: "up" | "down", disabled: boolean) {
    const button = document.createElement("button");
    button.className = "barkan-question-panel__option-control";
    button.type = "button";
    button.disabled = disabled || this.isChatThinking;
    button.setAttribute("aria-label", direction === "up" ? "Move selection up" : "Move selection down");
    button.innerHTML =
      direction === "up"
        ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 10.2917V2.70833" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.70833 6.5L6.5 2.70833L10.2917 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 2.70833V10.2917" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2917 6.5L6.5 10.2917L2.70833 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    button.addEventListener("click", () => this.moveActionChoiceSelection(direction === "up" ? -1 : 1));
    return button;
  }

  private handleActionChoicePanelKeyDown(event: KeyboardEvent) {
    if (this.isChatThinking) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const isTypingTarget = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";

    if (!isTypingTarget && /^[1-9]$/.test(event.key)) {
      const nextIndex = Number.parseInt(event.key, 10) - 1;
      if (nextIndex >= 0 && nextIndex < this.getRenderableActionChoices().length) {
        event.preventDefault();
        this.updateActiveChoiceAnswerState({
          ...this.getActiveChoiceAnswerState(),
          selectedIndex: nextIndex
        });
        this.renderActionChoicePanel({ animate: false, focus: true });
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveActionChoiceSelection(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveActionChoiceSelection(1);
      return;
    }

    if (!isTypingTarget && event.key === "ArrowLeft" && this.activeChoicePromptIndex > 0) {
      event.preventDefault();
      this.moveToChoiceQuestion(-1);
      return;
    }

    if (!isTypingTarget && event.key === "ArrowRight" && this.activeChoicePromptIndex < this.choicePrompts.length - 1) {
      event.preventDefault();
      this.moveToChoiceQuestion(1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (isTypingTarget) {
        (target as HTMLTextAreaElement | HTMLInputElement).blur();
      }
      this.actionChoiceContainer.querySelector<HTMLElement>(".barkan-question-panel")?.blur();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && this.canSubmitActionChoice()) {
      event.preventDefault();
      this.advanceOrSubmitActionChoice();
    }
  }

  private moveActionChoiceSelection(direction: -1 | 1) {
    const choices = this.getRenderableActionChoices();
    if (choices.length === 0) {
      return;
    }
    const activeAnswer = this.getActiveChoiceAnswerState();
    const nextIndex = Math.max(0, Math.min(choices.length - 1, activeAnswer.selectedIndex + direction));
    if (nextIndex === activeAnswer.selectedIndex) {
      return;
    }
    this.updateActiveChoiceAnswerState({
      ...activeAnswer,
      selectedIndex: nextIndex
    });
    this.renderActionChoicePanel({ animate: false, focus: true });
  }

  private moveToChoiceQuestion(direction: -1 | 1) {
    if (direction > 0 && !this.canSubmitActionChoice()) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(this.choicePrompts.length - 1, this.activeChoicePromptIndex + direction));
    if (nextIndex === this.activeChoicePromptIndex) {
      return;
    }

    this.activeChoicePromptIndex = nextIndex;
    this.renderActionChoicePanel({ animate: false, focus: true });
  }

  private advanceOrSubmitActionChoice() {
    if (this.activeChoicePromptIndex < this.choicePrompts.length - 1) {
      this.moveToChoiceQuestion(1);
      return;
    }

    this.submitSelectedActionChoice();
  }

  private getRenderableActionChoices(): Array<WidgetActionChoice & { editable?: boolean }> {
    return this.getRenderableActionChoicesForPrompt(this.activeChoicePromptIndex);
  }

  private getRenderableActionChoicesForPrompt(promptIndex: number): Array<WidgetActionChoice & { editable?: boolean }> {
    const choices: Array<WidgetActionChoice & { editable?: boolean }> = [...(this.choicePrompts[promptIndex]?.choices ?? [])];
    const answerState = this.choiceAnswerStates[promptIndex] ?? { freeformValue: "" };
    if (!this.hasBinaryYesNoChoicesForPrompt(promptIndex)) {
      choices.push({
        label: "Other (write your own)",
        editable: true,
        value: answerState.freeformValue
      });
    }
    return choices;
  }

  private hasBinaryYesNoChoicesForPrompt(promptIndex: number) {
    const normalizedChoices = (this.choicePrompts[promptIndex]?.choices ?? []).map((choice) => choice.label.trim().toLowerCase());
    return normalizedChoices.length === 2 && normalizedChoices.some((choice) => choice.startsWith("yes")) && normalizedChoices.some((choice) => choice.startsWith("no"));
  }

  private canSubmitActionChoice() {
    const activeAnswer = this.getActiveChoiceAnswerState();
    if (activeAnswer.selectedIndex < 0) {
      return false;
    }
    const selectedChoice = this.getRenderableActionChoices()[activeAnswer.selectedIndex];
    if (!selectedChoice) {
      return false;
    }
    return selectedChoice.editable ? activeAnswer.freeformValue.trim().length > 0 : true;
  }

  private submitSelectedActionChoice() {
    const activeAnswer = this.getActiveChoiceAnswerState();
    const selectedChoice = this.getRenderableActionChoices()[activeAnswer.selectedIndex] ?? null;
    if (!selectedChoice || !this.isCallActive || !this.choicePromptMode) {
      return;
    }

    const promptMode = this.choicePromptMode;
    const submittedMessage = promptMode === "question" || promptMode === "action" || this.choicePrompts.length > 1
      ? this.buildQuestionChoiceSubmissionMessage()
      : this.getDisplayAnswerForPrompt(this.activeChoicePromptIndex);
    const submittedQuestionDetails = this.buildSubmittedQuestionDetails();
    const clarificationContext = promptMode === "question" ? this.pendingClarificationContext : null;
    if (promptMode === "question") {
      this.pendingClarificationContext = null;
    }
    this.clearActionChoices();
    if (promptMode === "action") {
      if (!this.isActionModeActive) {
        return;
      }
      this.appendAnsweredQuestionsActivity(submittedQuestionDetails);
      const actionSubmittedChoice = {
        label: submittedMessage.slice(0, 240),
        value: this.buildSubmittedQuestionAnswerPayload()
      };
      this.appendGoalConversationEntry("user", submittedMessage);
      this.actionQueue.enqueue({ sessionId: this.callSessionId, selectedChoice: actionSubmittedChoice });
      return;
    }

    this.appendAnsweredQuestionsActivity(submittedQuestionDetails);
    this.handleCommittedTranscript(this.callSessionId, submittedMessage, {
      answeredQuestions: true,
      originalTranscript: clarificationContext?.originalPrompt,
      previousResponseId: clarificationContext?.previousResponseId ?? this.lastOpenAIResponseId,
      questionToolCallId: clarificationContext?.toolCallId,
      suppressFurtherQuestions: true,
      silentResponse: true,
      trustedUserInput: true,
      suppressUserMessage: true
    });
  }

  private appendAnsweredQuestionsActivity(entries: Array<{ question: string; answer: string }>) {
    const questionCount = entries.length;
    if (questionCount === 0) {
      return;
    }

    this.appendChatMessage("assistant", `Answered ${questionCount} ${questionCount === 1 ? "question" : "questions"}`, {
      allowDuplicate: true,
      presentation: "thinking-static",
      clarificationDetails: {
        entries
      }
    });
  }

  private buildQuestionChoiceSubmissionMessage() {
    return this.choicePrompts
      .map((prompt, index) => {
        const answer = this.getSelectedAnswerForPrompt(index);
        return `${index + 1}. ${prompt.prompt}\nAnswer: ${answer || "No answer provided"}`;
      })
      .join("\n\n");
  }

  private buildSubmittedQuestionDetails() {
    return this.choicePrompts.map((prompt, index) => ({
      question: prompt.prompt,
      answer: this.getDisplayAnswerForPrompt(index) || "No answer provided"
    }));
  }

  private buildSubmittedQuestionAnswerPayload() {
    const answers = this.choicePrompts.map((prompt, index) => ({
      question: prompt.prompt,
      answer: this.getDisplayAnswerForPrompt(index) || "No answer provided",
      value: this.getSelectedAnswerValueForPrompt(index)
    }));
    return answers.length === 1 ? answers[0] : answers;
  }

  private getSelectedChoiceForPrompt(promptIndex: number): (WidgetActionChoice & { editable?: boolean }) | null {
    const prompt = this.choicePrompts[promptIndex];
    const answerState = this.choiceAnswerStates[promptIndex];
    if (!prompt || !answerState || answerState.selectedIndex < 0) {
      return null;
    }

    const choices = this.getRenderableActionChoicesForPrompt(promptIndex);
    return choices[answerState.selectedIndex] ?? null;
  }

  private getSelectedAnswerForPrompt(promptIndex: number) {
    return this.getDisplayAnswerForPrompt(promptIndex);
  }

  private getDisplayAnswerForPrompt(promptIndex: number) {
    const answerState = this.choiceAnswerStates[promptIndex];
    const selectedChoice = this.getSelectedChoiceForPrompt(promptIndex);
    if (!answerState || !selectedChoice) {
      return "";
    }

    if (selectedChoice.editable === true) {
      return answerState.freeformValue.trim();
    }

    const value = selectedChoice.value;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value).trim()
      : selectedChoice.label.trim();
  }

  private getSelectedAnswerValueForPrompt(promptIndex: number): unknown {
    const answerState = this.choiceAnswerStates[promptIndex];
    const selectedChoice = this.getSelectedChoiceForPrompt(promptIndex);
    if (!answerState || !selectedChoice) {
      return null;
    }

    return selectedChoice.editable === true
      ? answerState.freeformValue.trim()
      : selectedChoice.value ?? selectedChoice.label;
  }

  private async processActionTurn(turn: ActionTurn) {
    if (!this.isCurrentSession(turn.sessionId) || !this.isActionModeActive) {
      return;
    }

    const actionGenerationSequenceId = this.actionGenerationSequenceId;
    const isActionGenerationCurrent = () => actionGenerationSequenceId === this.actionGenerationSequenceId;
    let progressLabelVisibleUntil = 0;
    const keepCurrentProgressLabelVisibleFor = (durationMs: number) => {
      progressLabelVisibleUntil = Math.max(progressLabelVisibleUntil, performance.now() + durationMs);
    };
    const waitForCurrentProgressLabel = async () => {
      const remainingMs = progressLabelVisibleUntil - performance.now();
      if (remainingMs > 0 && !shouldReduceMotion()) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
      }
      progressLabelVisibleUntil = 0;
    };

    const isNewActionGoal = Boolean(turn.userMessage && !hasPendingActionQuestion(this.goalRunState));
    this.setChatThinking(true, isNewActionGoal ? "Creating plan..." : "Thinking");
    try {
      const shouldContinuePendingGoal = Boolean(turn.userMessage && hasPendingActionQuestion(this.goalRunState));
      const initialGoalRunState = turn.userMessage && !shouldContinuePendingGoal
        ? createGoalRunStateForUserMessage(turn.userMessage)
        : this.goalRunState;
      if (turn.userMessage && !shouldContinuePendingGoal) {
        this.goalRunState = initialGoalRunState;
      }
      let payload: Record<string, unknown> = {
        siteKey: this.siteKey,
        currentPage: this.buildActionPageContext(),
        goalRunState: initialGoalRunState,
        goalConversationContext: this.goalConversationContext,
        ...(turn.userMessage ? { userMessage: turn.userMessage } : {}),
        ...(turn.selectedChoice ? { selectedChoice: turn.selectedChoice } : {})
      };

      for (let step = 0; step < 24; step++) {
        const response = await this.requestActionAgent(payload);
        await waitForCurrentProgressLabel();
        if (!this.isCurrentSession(turn.sessionId) || !this.isActionModeActive || !isActionGenerationCurrent()) {
          return;
        }

        if (response.type === "progress") {
          this.goalRunState = response.goalRunState;
          this.updateActionProgressLabel(response.progress.label);
          payload = {
            siteKey: this.siteKey,
            currentPage: this.buildActionPageContext(),
            goalRunState: this.goalRunState,
            goalConversationContext: this.goalConversationContext
          };
          continue;
        }

        if (response.type === "unavailable") {
          this.updateActionProgressLabel(response.progress?.label);
          this.clearActionModeState();
          this.setChatThinking(false);
          this.appendStreamingAssistantMessage(response.message, { allowDuplicate: true });
          return;
        }

        if (response.type === "final") {
          this.updateActionProgressLabel(response.progress?.label);
          const actionSummary = buildActionRunSummary(this.goalRunState, response.message, response.summaryTitle);
          this.goalRunState = null;
          this.clearActionChoices();
          this.setChatThinking(false);
          this.appendStreamingAssistantMessage(response.message, { allowDuplicate: true });
          this.appendChatMessage("assistant", actionSummary.title, {
            allowDuplicate: true,
            presentation: "action-summary",
            actionSummary
          });
          this.appendGoalConversationEntry("assistant", response.message);
          return;
        }

        if (response.type === "ask_user") {
          this.updateActionProgressLabel(response.progress?.label);
          this.goalRunState = response.goalRunState;
          const actionQuestionPrompts = this.buildActionQuestionPrompts(response);
          if (actionQuestionPrompts.length === 0) {
            this.setChatThinking(false);
            this.appendStreamingAssistantMessage(response.message, { allowDuplicate: true });
          }
          this.appendGoalConversationEntry("assistant", response.message);
          this.renderChoicePrompts(actionQuestionPrompts, "action");
          return;
        }

        if (response.type === "execute") {
          this.updateActionProgressLabel(response.progress?.label);
          const executionProgressLabel = response.progress?.label ?? this.chatThinkingTargetText;
          this.goalRunState = response.goalRunState;
          const httpCalls = readHttpCallsFromActionResponse(response);
          if (httpCalls.length === 0) {
            throw new Error("action response had no executable HTTP calls");
          }
          const httpBatchResults =
            httpCalls.length === 1
              ? [{ httpCall: httpCalls[0]!, result: await executeBrowserHttpCall(httpCalls[0]!) }]
              : await executeBrowserHttpCallBatch(httpCalls);
          if (!isActionGenerationCurrent()) {
            return;
          }
          this.setChatThinking(true, buildResultHoldProgressLabel(executionProgressLabel));
          keepCurrentProgressLabelVisibleFor(700);
          const httpBatchResult = buildHttpBatchResultPayload(httpBatchResults);
          this.appendGoalConversationEntry(
            "tool",
            httpBatchResults
              .map(({ httpCall, result }) => summarizeHttpCallResult(httpCall, result))
              .join("\n")
          );
          payload = {
            siteKey: this.siteKey,
            currentPage: this.buildActionPageContext(),
            goalRunState: this.goalRunState,
            goalConversationContext: this.goalConversationContext,
            httpBatchResult
          };
        }
      }

      this.setChatThinking(false);
      this.appendStreamingAssistantMessage("I could not complete that action in a safe number of steps.", {
        allowDuplicate: true
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.warn("[Barkan] action mode failed", error);
        const errorMessage = getErrorMessage(error);
        const friendlyMessage = errorMessage.includes("Restart the Barkan API server")
          ? "Action mode is not available on this Barkan API yet. Restart the Barkan API server, then try again."
          : "I could not complete that action. Please try again.";
        this.setChatThinking(false);
        this.appendStreamingAssistantMessage(friendlyMessage, {
          allowDuplicate: true
        });
      }
    } finally {
      if (this.isCurrentSession(turn.sessionId)) {
        this.setChatThinking(false);
        this.updateTextModeUi();
      }
    }
  }

  private buildActionQuestionPrompts(response: Extract<WidgetActionApiResponse, { type: "ask_user" }>): ChoicePrompt[] {
    const questions = response.questions?.length
      ? response.questions
      : [{ message: response.message, choices: response.choices }];

    return questions
      .map((question: WidgetActionQuestion) => ({
        prompt: question.message,
        choices: question.choices ?? []
      }))
      .filter((prompt) => prompt.prompt.trim().length > 0);
  }

  private async requestActionAgent(payload: Record<string, unknown>): Promise<WidgetActionApiResponse> {
    const abortController = new AbortController();
    this.activeActionAbortController = abortController;
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/widget/action`, {
        method: "POST",
        signal: abortController.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const responseText = await response.text();
        if (response.status === 404 && responseText.includes("/api/widget/action")) {
          throw new Error("action mode is not available on this Barkan API yet. Restart the Barkan API server.");
        }
        throw new Error(`action failed ${response.status}: ${responseText}`);
      }

      return (await response.json()) as WidgetActionApiResponse;
    } finally {
      if (this.activeActionAbortController === abortController) {
        this.activeActionAbortController = null;
      }
    }
  }

  private appendGoalConversationEntry(role: WidgetGoalConversationEntry["role"], text: string) {
    this.goalConversationContext = appendGoalConversationEntry(this.goalConversationContext, { role, text });
  }

  private buildActionPageContext(): { pathname: string; search?: string; hash?: string } {
    return {
      pathname: window.location.pathname || "/",
      ...(window.location.search ? { search: window.location.search } : {}),
      ...(window.location.hash ? { hash: window.location.hash } : {})
    };
  }

  private applyChatSidebarPageResize() {
    if (this.pageResizeCleanupTimer !== null) {
      window.clearTimeout(this.pageResizeCleanupTimer);
      this.pageResizeCleanupTimer = null;
    }

    const reservedWidth = this.getChatSidebarReservedWidth();
    if (reservedWidth <= 0) {
      this.clearChatSidebarPageResize();
      return;
    }

    const body = document.body;
    if (!body) {
      return;
    }

    if (!this.pageResizeRestore) {
      const previousMarginRight = body.style.marginRight;
      const previousTransition = body.style.transition;
      const previousBoxSizing = body.style.boxSizing;
      const previousReservedWidth = document.documentElement.style.getPropertyValue("--barkan-chat-sidebar-reserved-width");
      this.pageResizeRestore = () => {
        this.restoreChatSidebarPageResizeTargets();
        body.style.marginRight = previousMarginRight;
        body.style.transition = previousTransition;
        body.style.boxSizing = previousBoxSizing;
        if (previousReservedWidth) {
          document.documentElement.style.setProperty("--barkan-chat-sidebar-reserved-width", previousReservedWidth);
        } else {
          document.documentElement.style.removeProperty("--barkan-chat-sidebar-reserved-width");
        }
        this.pageResizeRestore = null;
      };
    }

    this.restoreChatSidebarPageResizeTargets();
    document.documentElement.style.setProperty("--barkan-chat-sidebar-reserved-width", `${reservedWidth}px`);
    body.style.boxSizing = "border-box";
    body.style.transition = this.isChatSidebarResizing ? "none" : mergeTransition(body.style.transition, CHAT_SIDEBAR_TRANSITION);
    body.style.marginRight = `${reservedWidth}px`;
  }

  private clearChatSidebarPageResize(options: { immediate?: boolean } = {}) {
    if (!this.pageResizeRestore) {
      return;
    }

    if (this.pageResizeCleanupTimer !== null) {
      window.clearTimeout(this.pageResizeCleanupTimer);
      this.pageResizeCleanupTimer = null;
    }

    const body = document.body;
    if (!body || options.immediate) {
      this.pageResizeRestore();
      return;
    }

    const restore = this.pageResizeRestore;
    body.style.transition = mergeTransition(body.style.transition, CHAT_SIDEBAR_TRANSITION);
    body.style.marginRight = "0px";
    this.restoreChatSidebarPageResizeTargets();
    this.pageResizeCleanupTimer = window.setTimeout(() => {
      if (this.pageResizeRestore !== restore) {
        return;
      }
      restore();
      this.pageResizeCleanupTimer = null;
    }, CHAT_SIDEBAR_TRANSITION_MS + 40);
  }

  private getChatSidebarReservedWidth() {
    if (window.innerWidth < 760) {
      return 0;
    }

    return Math.min(this.chatSidebarWidth, window.innerWidth - CHAT_SIDEBAR_PAGE_MIN_WIDTH_PX);
  }

  private restoreChatSidebarPageResizeTargets() {
    for (const targetRestore of this.pageResizeTargetRestores) {
      if (!targetRestore.element.isConnected) {
        continue;
      }
      targetRestore.element.style.width = targetRestore.width;
      targetRestore.element.style.maxWidth = targetRestore.maxWidth;
      targetRestore.element.style.minWidth = targetRestore.minWidth;
      targetRestore.element.style.right = targetRestore.right;
      targetRestore.element.style.transition = targetRestore.transition;
      targetRestore.element.style.boxSizing = targetRestore.boxSizing;
    }
    this.pageResizeTargetRestores = [];
  }

  private setChatSidebarWidth(width: number, options: { updateLayout?: boolean } = {}) {
    this.chatSidebarWidth = this.getClampedChatSidebarWidth(width);
    this.chatPanel.style.setProperty("--barkan-chat-sidebar-width", `${this.chatSidebarWidth}px`);
    if (options.updateLayout === false || !this.isTextModeActive) {
      return;
    }

    this.applyChatSidebarPageResize();
    this.positionAgentAtTarget();
  }

  private getClampedChatSidebarWidth(width: number) {
    const maxWidth = Math.max(
      CHAT_SIDEBAR_MIN_WIDTH_PX,
      Math.min(CHAT_SIDEBAR_MAX_WIDTH_PX, window.innerWidth - CHAT_SIDEBAR_PAGE_MIN_WIDTH_PX)
    );
    return Math.round(Math.min(Math.max(width, CHAT_SIDEBAR_MIN_WIDTH_PX), maxWidth));
  }

  private updateChatComposer() {
    this.textQuestionInput.style.height = "0px";
    const nextHeight = Math.min(132, Math.max(20, this.textQuestionInput.scrollHeight));
    this.textQuestionInput.style.height = `${nextHeight}px`;
    const hasText = this.textQuestionInput.value.trim().length > 0;
    const isVoiceButton = !this.isChatThinking && !hasText;
    this.textQuestionSendButton.disabled = this.isChatCallBusy;
    this.textQuestionSendButton.dataset.generating = this.isChatThinking ? "true" : "false";
    this.textQuestionSendButton.dataset.inputEmpty = isVoiceButton ? "true" : "false";
    this.textQuestionSendButton.setAttribute(
      "aria-label",
      this.isChatThinking ? "Stop generation" : isVoiceButton ? "Start voice chat" : "Send chat message"
    );
    this.textQuestionSendButton.title = this.isChatThinking ? "Stop" : isVoiceButton ? "Voice" : "Send";
    this.actionChoiceContainer
      .querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>("button, textarea")
      .forEach((control) => {
        control.disabled = this.isChatThinking;
      });
  }

  private stopCurrentGeneration() {
    this.recordDebugEvent("stop-generation");
    this.turnQueue.clear();
    this.actionQueue.clear();
    this.clearAutomationTimers();
    this.automationSequenceId++;
    this.actionGenerationSequenceId++;
    if (this.activeOpenAIAbortController) {
      this.isSpeechInterruptedByUser = true;
    }
    this.activeOpenAIAbortController?.abort();
    this.activeOpenAIAbortController = null;
    this.activeActionAbortController?.abort();
    this.activeActionAbortController = null;
    this.stopSpeakingAudio();
    this.currentAssistantSpeech = "";
    this.setChatThinking(false);
    if (this.state === "thinking" || this.state === "speaking") {
      this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
    }
    this.updateTextModeUi();
  }

  private appendChatMessage(
    role: ChatPanelMessage["role"],
    text: string,
    options: {
      allowDuplicate?: boolean;
      presentation?: ChatPanelMessage["presentation"];
      actionSummary?: ChatPanelMessage["actionSummary"];
      clarificationDetails?: ChatPanelMessage["clarificationDetails"];
    } = {}
  ): string | null {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return null;
    }

    const lastMessage = this.chatMessages[this.chatMessages.length - 1];
    if (
      !options.allowDuplicate &&
      lastMessage?.role === role &&
      normalizeTranscript(lastMessage.text) === normalizeTranscript(trimmedText)
    ) {
      return lastMessage.id;
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    this.chatMessages = [
      ...this.chatMessages,
      {
        id,
        role,
        text: trimmedText,
        presentation: options.presentation ?? "normal",
        ...(options.actionSummary ? { actionSummary: options.actionSummary } : {}),
        ...(options.clarificationDetails ? { clarificationDetails: options.clarificationDetails } : {})
      }
    ].slice(-30);
    this.renderChatMessages();
    return id;
  }

  private updateChatMessageText(messageId: string | null, text: string) {
    if (!messageId) {
      return;
    }

    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    let changed = false;
    this.chatMessages = this.chatMessages.map((message) => {
      if (message.id !== messageId || message.text === nextText) {
        return message;
      }
      changed = true;
      return { ...message, text: nextText };
    });

    if (changed) {
      this.renderChatMessages();
    }
  }

  private appendStreamingAssistantMessage(
    text: string,
    options: {
      allowDuplicate?: boolean;
      presentation?: ChatPanelMessage["presentation"];
    } = {}
  ): string | null {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return null;
    }

    if (shouldReduceMotion() || trimmedText.length <= 18) {
      return this.appendChatMessage("assistant", trimmedText, options);
    }

    const firstChunk = this.getStreamingTextPrefix(trimmedText, 18);
    const messageId = this.appendChatMessage("assistant", firstChunk, options);
    if (!messageId || firstChunk.length >= trimmedText.length) {
      return messageId;
    }

    let visibleLength = firstChunk.length;
    const streamNextChunk = () => {
      if (!this.chatMessages.some((message) => message.id === messageId)) {
        return;
      }
      visibleLength = this.getStreamingTextPrefix(trimmedText, visibleLength + 18).length;
      this.updateChatMessageText(messageId, trimmedText.slice(0, visibleLength));
      if (visibleLength < trimmedText.length) {
        window.setTimeout(streamNextChunk, 28);
      }
    };
    window.setTimeout(streamNextChunk, 28);
    return messageId;
  }

  private getStreamingTextPrefix(text: string, minimumLength: number) {
    if (minimumLength >= text.length) {
      return text;
    }

    const nextWhitespaceIndex = text.slice(minimumLength).search(/\s/);
    return text.slice(0, nextWhitespaceIndex >= 0 ? minimumLength + nextWhitespaceIndex + 1 : minimumLength);
  }

  private setChatThinking(isThinking: boolean, text = "Thinking") {
    const rawNextText = text.trim() || "Thinking";
    const nextText =
      this.isActionModeActive && rawNextText !== "Thinking"
        ? formatActionProgressLabelForDisplay(rawNextText) ?? rawNextText
        : rawNextText;
    if (this.isChatThinking === isThinking && this.chatThinkingTargetText === nextText) {
      return;
    }

    if (!isThinking) {
      this.clearChatThinkingTransition();
      this.isChatThinking = false;
      this.chatThinkingText = nextText;
      this.chatThinkingTargetText = nextText;
      this.chatThinkingPreviousText = null;
      this.isChatThinkingTransitioning = false;
      this.updateChatComposer();
      this.renderChatMessages();
      return;
    }

    const previousText = this.isChatThinking ? this.chatThinkingTargetText : nextText;
    this.isChatThinking = isThinking;
    this.chatThinkingTargetText = nextText;
    if (!this.isChatThinking || previousText === nextText || shouldReduceMotion()) {
      this.clearChatThinkingTransition();
      this.chatThinkingText = nextText;
      this.chatThinkingPreviousText = null;
      this.isChatThinkingTransitioning = false;
      this.updateChatComposer();
      this.renderChatMessages();
      return;
    }

    this.updateChatComposer();
    this.startChatThinkingTransition(previousText, nextText);
  }

  private startChatThinkingTransition(previousText: string, nextText: string) {
    this.clearChatThinkingTransition();
    const sequence = ++this.chatThinkingTransitionSequence;
    const durationMs = 360;
    this.chatThinkingPreviousText = previousText;
    this.chatThinkingText = nextText;
    this.isChatThinkingTransitioning = true;
    this.renderChatMessages();
    this.chatThinkingTransitionTimer = window.setTimeout(() => {
      if (sequence !== this.chatThinkingTransitionSequence || !this.isChatThinking) {
        return;
      }
      this.chatThinkingPreviousText = null;
      this.chatThinkingText = this.chatThinkingTargetText;
      this.isChatThinkingTransitioning = false;
      this.chatThinkingTransitionTimer = null;
      this.renderChatMessages();
    }, durationMs);
  }

  private clearChatThinkingTransition() {
    this.chatThinkingTransitionSequence += 1;
    this.chatThinkingPreviousText = null;
    this.isChatThinkingTransitioning = false;
    if (this.chatThinkingTransitionTimer !== null) {
      window.clearTimeout(this.chatThinkingTransitionTimer);
      this.chatThinkingTransitionTimer = null;
    }
  }

  private updateActionProgressLabel(label: string | undefined) {
    const nextLabel = formatActionProgressLabelForDisplay(label);
    if (!nextLabel) {
      return;
    }
    this.setChatThinking(true, nextLabel);
    this.renderChatMessages();
  }

  private settleActiveThinkingMessages() {
    let changed = false;
    this.chatMessages = this.chatMessages.map((message) => {
      if (message.presentation !== "thinking") {
        return message;
      }
      changed = true;
      return { ...message, presentation: "thinking-static" };
    });

    if (changed) {
      this.renderChatMessages();
    }
  }

  private renderChatMessages() {
    const fragment = document.createDocumentFragment();

    for (const message of this.chatMessages) {
      fragment.appendChild(this.createChatMessageElement(message));
    }

    if (this.isChatThinking) {
      const thinkingMessage = this.createChatMessageElement({
        id: "thinking",
        role: "assistant",
        text: this.chatThinkingText,
        presentation: "thinking"
      });
      fragment.appendChild(thinkingMessage);
    }

    this.chatMessageList.replaceChildren(fragment);
    const hasMessages = this.chatMessages.length > 0 || this.isChatThinking;
    this.chatEmptyState.dataset.visible = hasMessages ? "false" : "true";
    if (this.isTextModeActive) {
      window.setTimeout(() => {
        const thread = this.chatMessageList.closest(".chat-panel__thread");
        thread?.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
      }, 0);
    }
  }

  private createChatMessageElement(message: ChatPanelMessage) {
    const item = document.createElement("li");
    const role = message.role;
    item.className = `chat-panel__message-item chat-panel__message-item--${role}`;

    const bubble = document.createElement("div");
    bubble.className = `chat-panel__message chat-panel__message--${role}`;
    if (message.presentation === "authorization") {
      bubble.classList.add("chat-panel__message--authorization");
      bubble.appendChild(this.createAutomationAuthorizationCard(message.text));
      item.appendChild(bubble);
      return item;
    }

    if (message.presentation === "thinking") {
      const displayText = this.formatThinkingMessageText(message.text);
      const previousDisplayText = this.chatThinkingPreviousText
        ? this.formatThinkingMessageText(this.chatThinkingPreviousText)
        : null;
      const content = document.createElement("div");
      content.className = "chat-panel__thinking-line";
      content.setAttribute("aria-label", displayText);

      const text = document.createElement("span");
      text.className = "chat-panel__thinking-text";
      text.dataset.text = displayText;
      const shouldAnimateThinkingLabel =
        this.isChatThinkingTransitioning &&
        previousDisplayText !== null &&
        previousDisplayText !== displayText &&
        !shouldReduceMotion();
      if (shouldAnimateThinkingLabel) {
        const leavingLabel = document.createElement("span");
        leavingLabel.className = "chat-panel__thinking-label chat-panel__thinking-label--leaving";
        leavingLabel.textContent = previousDisplayText ?? "";

        const enteringLabel = document.createElement("span");
        enteringLabel.className = "chat-panel__thinking-label chat-panel__thinking-label--entering";
        enteringLabel.textContent = displayText;

        text.append(leavingLabel, enteringLabel);
      } else {
        const currentLabel = document.createElement("span");
        currentLabel.className = "chat-panel__thinking-label";
        currentLabel.textContent = displayText;
        text.appendChild(currentLabel);
      }
      content.appendChild(text);
      bubble.appendChild(content);
      item.appendChild(bubble);
      return item;
    }

    if (message.presentation === "action-summary" && message.actionSummary) {
      bubble.appendChild(this.createActionSummaryCard(message.actionSummary));
      item.appendChild(bubble);
      return item;
    }

    if (message.clarificationDetails) {
      const detailRegionId = `barkan-chat-activity-${message.id}`;
      const isExpanded = this.expandedChatActivityMessageIds.has(message.id);
      const button = document.createElement("button");
      button.className = "chat-panel__activity-toggle";
      button.type = "button";
      button.textContent = message.text;
      button.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      button.setAttribute("aria-controls", detailRegionId);
      button.addEventListener("click", () => {
        if (this.expandedChatActivityMessageIds.has(message.id)) {
          this.expandedChatActivityMessageIds.delete(message.id);
        } else {
          this.expandedChatActivityMessageIds.add(message.id);
        }
        this.renderChatMessages();
      });
      bubble.appendChild(button);

      if (isExpanded) {
        const details = document.createElement("div");
        details.id = detailRegionId;
        details.className = "chat-panel__activity-details";
        for (const entry of message.clarificationDetails.entries) {
          const entryElement = document.createElement("div");
          entryElement.className = "chat-panel__activity-entry";
          entryElement.append(this.createChatActivityLine("Question:", entry.question), this.createChatActivityLine("Answer:", entry.answer));
          details.appendChild(entryElement);
        }
        bubble.appendChild(details);
      }

      item.appendChild(bubble);
      return item;
    }

    const content = document.createElement("p");
    content.className = "chat-panel__message-content";
    if (message.presentation === "thinking-static") {
      content.classList.add("chat-panel__message-content--thinking-static");
    }
    content.textContent = message.text;

    bubble.appendChild(content);
    item.appendChild(bubble);
    return item;
  }

  private createActionSummaryCard(summary: WidgetActionRunSummary) {
    const card = document.createElement("article");
    card.className = "action-summary-card";
    card.setAttribute("aria-label", `Action summary: ${summary.title}`);

    const main = document.createElement("div");
    main.className = "action-summary-card__main";

    const icon = document.createElement("span");
    icon.className = "action-summary-card__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M8 5.5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M9 9h6M9 12h6M9 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M9.5 3.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;

    const body = document.createElement("div");
    body.className = "action-summary-card__body";

    const title = document.createElement("p");
    title.className = "action-summary-card__title";
    title.textContent = summary.title;
    body.appendChild(title);

    if (summary.positiveCount > 0 || summary.negativeCount > 0) {
      const counts = document.createElement("div");
      counts.className = "action-summary-card__counts";
      counts.setAttribute("aria-label", `${summary.positiveCount} changed, ${summary.negativeCount} removed`);

      const positive = document.createElement("span");
      positive.className = "action-summary-card__count action-summary-card__count--positive";
      positive.textContent = `+${summary.positiveCount}`;

      const negative = document.createElement("span");
      negative.className = "action-summary-card__count action-summary-card__count--negative";
      negative.textContent = `-${summary.negativeCount}`;

      counts.append(positive, negative);
      body.appendChild(counts);
    }

    const undo = document.createElement("button");
    undo.className = "action-summary-card__undo";
    undo.type = "button";
    undo.setAttribute("aria-disabled", "true");
    undo.title = "Undo";
    undo.innerHTML = `
      <span>Undo</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 7H5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 7h8.5a5.5 5.5 0 1 1-4.6 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    main.append(icon, body, undo);

    const details = document.createElement("button");
    details.className = "action-summary-card__details";
    details.type = "button";
    details.setAttribute("aria-disabled", "true");
    details.innerHTML = `
      <span>Details</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    card.append(main, details);
    return card;
  }

  private createChatActivityLine(label: string, value: string) {
    const line = document.createElement("p");
    line.className = "chat-panel__activity-line";
    const labelElement = document.createElement("span");
    labelElement.className = "chat-panel__activity-line-label";
    labelElement.textContent = label;
    line.append(labelElement, " ", value);
    return line;
  }

  private formatThinkingMessageText(text: string) {
    if (!this.isActionModeActive || text === "Thinking") {
      return text;
    }

    return formatActionProgressLabelForDisplay(text) ?? text;
  }

  private createAutomationAuthorizationCard(text: string) {
    const card = document.createElement("div");
    card.className = "authorization-card";

    const header = document.createElement("div");
    header.className = "authorization-card__header";

    const logo = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    logo.setAttribute("class", "authorization-card__logo");
    logo.setAttribute("viewBox", "0 0 256 193");
    logo.setAttribute("aria-hidden", "true");
    logo.innerHTML = `
      <path fill="#4285F4" d="M58.18 192.05V93.14L25.5 63.19 0 48.86v126.8c0 9.08 7.36 16.39 16.39 16.39h41.79Z"/>
      <path fill="#34A853" d="M197.82 192.05h41.79c9.08 0 16.39-7.36 16.39-16.39V48.86l-29.27 16.75-28.91 27.53v98.91Z"/>
      <path fill="#EA4335" d="m58.18 93.14-4.45-41.08 4.45-39.31L128 64.98l69.82-52.23 4.67 37.19-4.67 43.2L128 145.37 58.18 93.14Z"/>
      <path fill="#FBBC04" d="M197.82 12.75v80.39L256 48.86V20.94c0-20.3-23.16-31.86-39.31-19.66l-18.87 11.47Z"/>
      <path fill="#C5221F" d="M0 48.86 26.77 69.2l31.41 23.94V12.75L39.31 1.28C23.11-10.92 0 .69 0 20.94v27.92Z"/>
    `;

    const title = document.createElement("p");
    title.className = "authorization-card__title";
    title.textContent = text;
    header.append(logo, title);

    const copy = document.createElement("p");
    copy.className = "authorization-card__copy";
    copy.textContent = "Authorize Gmail so Barkan can finish deploying this automation blueprint.";

    const button = document.createElement("button");
    button.className = "authorization-card__button";
    button.type = "button";
    button.textContent = "Authorize Gmail";
    button.addEventListener("click", () => void this.authorizeAutomationGmail(button));

    card.append(header, copy, button);
    return card;
  }

  private async processCommittedTurn(turn: CommittedTurn) {
    if (!this.isCurrentSession(turn.sessionId)) {
      return;
    }

    this.isSpeechInterruptedByUser = false;
    this.currentAssistantSpeech = "";
    let pendingTtsPlayerPromise: Promise<RealtimeTtsPlayer | null> | null = null;
    let wasInterruptedByUser = false;
    try {
      const interactionStartedAt = performance.now();
      recordLatencyLog("turn-start", interactionStartedAt, {
        mode: this.textEntryMode,
        route: getCurrentRoute(),
        transcriptLength: turn.transcript.length,
        silentResponse: turn.silentResponse === true,
        answeredQuestions: turn.answeredQuestions === true,
        hasPreviousResponseId: Boolean(turn.previousResponseId ?? this.lastOpenAIResponseId)
      });
      window.__BARKAN_DEBUG__ = {
        ...(window.__BARKAN_DEBUG__ ?? {}),
        lastRawResponse: "",
        lastSpokenResponse: "",
        lastPointBox: null,
        lastTimings: {}
      };
      this.hideAgent();
      this.setChatThinking(true);
      this.setState("thinking", "looking");
      const contextStartedAt = performance.now();
      const contextPromise = capturePageContext(turn.transcript, contextStartedAt);
      const ttsPlayerPromise = turn.silentResponse ? Promise.resolve(null) : this.prepareTtsPlayer();
      pendingTtsPlayerPromise = ttsPlayerPromise;

      const pageContext = await contextPromise;
      recordLatencyLog("dom-capture-ready", interactionStartedAt, {
        route: pageContext.snapshot.route,
        domElements: countDomSnapshotElements(pageContext.snapshot.elements),
        uiFacts: pageContext.snapshot.uiFacts.length,
        offscreenUiFacts: pageContext.snapshot.offscreenUiFacts.length,
        contentBlocks: pageContext.snapshot.contentBlocks?.length ?? 0,
        forms: pageContext.snapshot.forms?.length ?? 0,
        relationships: pageContext.snapshot.relationships?.length ?? 0,
        timings: pageContext.debugTimings ?? {}
      });
      if (!this.isCurrentSession(turn.sessionId)) {
        void ttsPlayerPromise.then((player) => player?.close()).catch(() => undefined);
        return;
      }
      window.__BARKAN_DEBUG__ = {
        ...(window.__BARKAN_DEBUG__ ?? {}),
        lastTranscript: turn.historyTranscript ?? turn.transcript,
        lastDomSnapshot: pageContext.snapshot,
        lastTimings: {
          ...(window.__BARKAN_DEBUG__?.lastTimings ?? {}),
          releaseToContextReadyMs: Math.round(performance.now() - interactionStartedAt),
          ...(pageContext.debugTimings ?? {})
        }
      };
      await this.askOpenAI(turn, pageContext, ttsPlayerPromise, interactionStartedAt);
    } catch (error) {
      wasInterruptedByUser = (error as Error).name === "AbortError" && this.isSpeechInterruptedByUser;
      if ((error as Error).name !== "AbortError") {
        console.warn("[Barkan] turn failed", error);
      }
      void pendingTtsPlayerPromise?.then((player) => player?.close()).catch(() => undefined);
      if (this.isCurrentSession(turn.sessionId) && !wasInterruptedByUser) {
        this.showError("try again");
      }
    } finally {
      if (wasInterruptedByUser) {
        this.isSpeechInterruptedByUser = false;
      }
      if (this.isCurrentSession(turn.sessionId)) {
        this.setChatThinking(false);
        if (this.state !== "error") {
          this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
          this.resumeMicrophoneCapture();
        }
      }
    }
  }

  private async askOpenAI(
    turn: CommittedTurn,
    pageContext: PageContext,
    ttsPlayerPromise: Promise<RealtimeTtsPlayer | null>,
    interactionStartedAt: number
  ) {
    const abortController = new AbortController();
    this.activeOpenAIAbortController = abortController;
    let response: Response | null = null;
    const previousOpenAIResponseId = turn.previousResponseId ?? this.lastOpenAIResponseId;
    try {
      this.pendingOpenAIResponseId = null;
      window.__BARKAN_DEBUG__ = {
        ...(window.__BARKAN_DEBUG__ ?? {}),
        sentPreviousOpenAIResponseId: previousOpenAIResponseId
      };
      const requestBody = {
        siteKey: this.siteKey,
        userPrompt: buildOpenAIUserPrompt(turn),
        ...(previousOpenAIResponseId ? { previousResponseId: previousOpenAIResponseId } : {}),
        ...(turn.questionToolCallId ? { questionToolCallId: turn.questionToolCallId } : {}),
        ...(turn.suppressFurtherQuestions ? { suppressFurtherQuestions: true } : {}),
        ...(turn.navigationContext ? { navigationContext: turn.navigationContext } : {}),
        ...(turn.guidanceContext ? { guidanceContext: turn.guidanceContext } : {}),
        debugTimings: pageContext.debugTimings,
        domSnapshot: pageContext.snapshot
      };
      const requestBodyJson = JSON.stringify(requestBody);
      const fetchStartedAt = performance.now();
      recordLatencyLog("openai-fetch-start", interactionStartedAt, {
        apiBaseUrl: this.apiBaseUrl,
        route: pageContext.snapshot.route,
        payloadBytes: requestBodyJson.length,
        hasPreviousResponseId: Boolean(previousOpenAIResponseId),
        hasQuestionToolCallId: Boolean(turn.questionToolCallId),
        suppressFurtherQuestions: turn.suppressFurtherQuestions === true
      });
      response = await fetch(`${this.apiBaseUrl}/api/widget/openai-stream`, {
        method: "POST",
        signal: abortController.signal,
        headers: { "content-type": "application/json" },
        body: requestBodyJson
      });
      recordLatencyLog("openai-response-headers", interactionStartedAt, {
        fetchMs: Math.round(performance.now() - fetchStartedAt),
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type") ?? ""
      });
    } catch (error) {
      this.clearOpenAIAbortController(abortController);
      recordLatencyLog("openai-fetch-error", interactionStartedAt, {
        error: getErrorMessage(error)
      });
      throw error;
    }

    if (!response) {
      this.clearOpenAIAbortController(abortController);
      throw new Error("openai failed");
    }

    if (!response.ok) {
      recordLatencyLog("openai-response-error", interactionStartedAt, {
        status: response.status,
        contentType: response.headers.get("content-type") ?? ""
      });
      this.clearOpenAIAbortController(abortController);
      throw new Error("openai failed");
    }

    const chunker = new SpokenResponseStreamingChunker();
    const shouldSpeakResponse = turn.silentResponse !== true;
    const queuedTtsChunks: Array<{ text: string; flush: boolean }> = [];
    let ttsPlayer: RealtimeTtsPlayer | null | undefined;
    const ttsReady = shouldSpeakResponse
      ? ttsPlayerPromise
          .then((player) => {
            ttsPlayer = player;
            recordLatencyLog("tts-player-ready", interactionStartedAt, {
              ready: Boolean(player),
              queuedChunks: queuedTtsChunks.length
            });
            for (const chunk of queuedTtsChunks.splice(0)) {
              ttsPlayer?.sendText(chunk.text, chunk.flush);
            }
            return player;
          })
          .catch((error) => {
            console.warn("[Barkan] tts setup failed", error);
            recordLatencyLog("tts-player-error", interactionStartedAt, {
              error: getErrorMessage(error)
            });
            ttsPlayer = null;
            return null;
          })
      : Promise.resolve(null);

    const sendTtsChunk = (text: string, flush: boolean) => {
      if (!shouldSpeakResponse) {
        return;
      }

      if (!this.isCurrentSession(turn.sessionId)) {
        return;
      }

      if (ttsPlayer === undefined) {
        queuedTtsChunks.push({ text, flush });
        return;
      }

      ttsPlayer?.sendText(text, flush);
    };

    let accumulated = "";
    let latestSpoken = "";
    let hasPointed = false;
    let handledScroll = false;
    let handledScrollToElementId: string | null = null;
    let receivedOpenAIResponseId: string | null = null;
    let guidancePointCandidate: { elementId: string; label?: string } | null = null;
    let renderedQuestionEvent = false;
    let streamingAssistantMessageId: string | null = null;
    let firstSseChunkLogged = false;
    let firstSseEventLogged = false;
    let firstTextLogged = false;
    let firstQuestionLogged = false;
    let sseEventCount = 0;
    let sseChunkCount = 0;
    let sseTotalBytes = 0;
    const pendingNavigation: { current: { route: string; label?: string } | null } = { current: null };
    this.setState("speaking", "thinking");

    try {
      await readPostSseStream(response, async (text) => {
        if (!this.isCurrentSession(turn.sessionId) || handledScroll) {
          return;
        }

        accumulated += text;
        const parsed = tryExtractSpeakableText(accumulated);
        if (!parsed) {
          window.__BARKAN_DEBUG__ = {
            ...(window.__BARKAN_DEBUG__ ?? {}),
            lastRawResponse: accumulated,
            lastSpokenResponse: "",
            lastPointBox: null
          };
          return;
        }

        const scrollToAction = parsed.scrollTo;
        if (scrollToAction && handledScrollToElementId !== scrollToAction.elementId) {
          handledScrollToElementId = scrollToAction.elementId;
          const target = await this.performScrollToElement(scrollToAction.elementId, pageContext);
          if (target && !hasPointed) {
            hasPointed = true;
            guidancePointCandidate = {
              elementId: scrollToAction.elementId,
              label: scrollToAction.label
            };
            this.showAgentAtPoint(target.x, target.y, parsed.spokenText || scrollToAction.label);
          }
        }

        const scrollAction = parsed.scroll;
        if (scrollAction) {
          if (await this.retryTurnAfterScroll(turn, ttsReady, () => this.performScrollAction(scrollAction, pageContext))) {
            handledScroll = true;
            return;
          }
        }

        if (parsed.box && !hasPointed) {
          hasPointed = true;
          const target = pointBoxToViewportCenter(parsed.box, window.innerWidth, window.innerHeight);
          this.showAgentAtPoint(target.x, target.y, parsed.spokenText);
        }

        const resolvedPointTarget = parsed.elementId ? resolvePointTarget(pageContext, parsed.elementId) : null;
        if (resolvedPointTarget && !hasPointed) {
          hasPointed = true;
          guidancePointCandidate = {
            elementId: resolvedPointTarget.elementId ?? parsed.elementId!,
            label: resolvedPointTarget.label
          };
          this.showAgentAtPoint(resolvedPointTarget.x, resolvedPointTarget.y, parsed.spokenText);
        }

        latestSpoken = parsed.spokenText;
        if (hasPointed && latestSpoken) {
          this.setAgentText(latestSpoken);
        }
        window.__BARKAN_DEBUG__ = {
          ...(window.__BARKAN_DEBUG__ ?? {}),
          lastRawResponse: accumulated,
          lastSpokenResponse: latestSpoken,
          lastPointBox: parsed.box ?? resolvedPointTarget ?? parsed.elementId,
          lastTimings: {
            ...(window.__BARKAN_DEBUG__?.lastTimings ?? {}),
            firstOpenAITextMs:
              window.__BARKAN_DEBUG__?.lastTimings?.firstOpenAITextMs ??
              Math.round(performance.now() - interactionStartedAt)
          }
        };
        if (latestSpoken) {
          if (!firstTextLogged) {
            firstTextLogged = true;
            recordLatencyLog("first-speakable-text", interactionStartedAt, {
              chars: latestSpoken.length,
              sseChunkCount,
              sseEventCount,
              sseTotalBytes
            });
          }
          this.currentAssistantSpeech = latestSpoken;
          this.setState("speaking", latestSpoken);
          if (!streamingAssistantMessageId) {
            this.setChatThinking(false);
            streamingAssistantMessageId = this.appendChatMessage("assistant", latestSpoken, { allowDuplicate: true });
          } else {
            this.updateChatMessageText(streamingAssistantMessageId, latestSpoken);
          }
        }

        for (const chunk of chunker.updateSpokenPreview(latestSpoken)) {
          sendTtsChunk(chunk.text, chunk.flush);
        }
      }, async (event) => {
        if (!this.isCurrentSession(turn.sessionId) || handledScroll) {
          return;
        }
        sseEventCount += 1;
        if (!firstSseEventLogged) {
          firstSseEventLogged = true;
          recordLatencyLog("first-sse-event", interactionStartedAt, {
            type: event.type,
            sseChunkCount,
            sseTotalBytes
          });
        }

        if (event.type === "navigate") {
          pendingNavigation.current = event;
          return;
        }

        if (event.type === "openai_response") {
          recordLatencyLog("openai-response-id", interactionStartedAt, {
            responseId: event.responseId
          });
          receivedOpenAIResponseId = event.responseId;
          this.pendingOpenAIResponseId = event.responseId;
          window.__BARKAN_DEBUG__ = {
            ...(window.__BARKAN_DEBUG__ ?? {}),
            pendingOpenAIResponseId: event.responseId,
            lastOpenAIResponseId: this.lastOpenAIResponseId ?? undefined
          };
          return;
        }

        if (event.type === "question") {
          if (!firstQuestionLogged) {
            firstQuestionLogged = true;
            recordLatencyLog("first-question-event", interactionStartedAt, {
              questions: event.questions?.length ?? (event.question ? 1 : 0),
              sseChunkCount,
              sseEventCount,
              sseTotalBytes
            });
          }
          if (!this.isTextModeActive) {
            this.setTextModeActive(true);
          }
          this.pendingClarificationContext = {
            originalPrompt: turn.historyTranscript ?? turn.transcript,
            previousResponseId: receivedOpenAIResponseId ?? this.pendingOpenAIResponseId ?? previousOpenAIResponseId,
            ...(event.toolCallId ? { toolCallId: event.toolCallId } : {})
          };
          renderedQuestionEvent = true;
          this.renderChoicePrompts(
            event.questions.map((question) => ({
              prompt: question.question,
              choices: question.choices
            })),
            "question"
          );
          window.__BARKAN_DEBUG__ = {
            ...(window.__BARKAN_DEBUG__ ?? {}),
            lastQuestion: {
              questions: event.questions.map((question) => ({
                question: question.question,
                choices: question.choices.map((choice) => choice.label)
              }))
            }
          };
          return;
        }

        if (event.type === "done") {
          recordLatencyLog("sse-done", interactionStartedAt, {
            sseChunkCount,
            sseEventCount,
            sseTotalBytes,
            responseChars: accumulated.length,
            renderedQuestionEvent
          });
          return;
        }

        if (event.type === "scroll") {
          if (event.elementId) {
            const target = await this.performScrollToElement(event.elementId, pageContext);
            if (target) {
              guidancePointCandidate = {
                elementId: event.elementId,
                label: target.label ?? event.label
              };
              if (!hasPointed) {
                hasPointed = true;
                this.showAgentAtPoint(target.x, target.y, latestSpoken || event.label || "");
              }
              if (event.needFurtherAction === true) {
                this.armGuidanceClick(turn, pageContext, {
                  elementId: event.elementId,
                  label: target.label ?? event.label,
                  instruction: latestSpoken || event.label || ""
                });
              } else {
                this.cancelPendingGuidanceClick();
              }
            }
            return;
          }

          const retryScroll = event.surfaceId && event.direction
              ? () =>
                  this.performScrollAction(
                    {
                      surfaceId: event.surfaceId!,
                      direction: event.direction!
                    },
                    pageContext
                  )
              : null;

          if (retryScroll && (await this.retryTurnAfterScroll(turn, ttsReady, retryScroll))) {
            handledScroll = true;
          }
          return;
        }

        if (event.type === "point" && !hasPointed) {
          const label = event.label ?? latestSpoken;
          if (event.box) {
            const target = pointBoxToViewportCenter({ ...event.box, label }, window.innerWidth, window.innerHeight);
            hasPointed = true;
            this.showAgentAtPoint(target.x, target.y, latestSpoken || label);
            return;
          }

          const resolvedPointTarget = event.elementId ? resolvePointTarget(pageContext, event.elementId) : null;
          if (resolvedPointTarget) {
            hasPointed = true;
            guidancePointCandidate = {
              elementId: resolvedPointTarget.elementId ?? event.elementId!,
              label: resolvedPointTarget.label ?? label
            };
            this.showAgentAtPoint(resolvedPointTarget.x, resolvedPointTarget.y, latestSpoken || label);
            if (event.needFurtherAction === true) {
              this.armGuidanceClick(turn, pageContext, {
                elementId: resolvedPointTarget.elementId ?? event.elementId!,
                label: resolvedPointTarget.label ?? label,
                instruction: latestSpoken || label
              });
            } else {
              this.cancelPendingGuidanceClick();
            }
            return;
          }
        }
      }, (chunk) => {
        sseChunkCount = chunk.chunkIndex;
        sseTotalBytes = chunk.totalBytes;
        if (!firstSseChunkLogged) {
          firstSseChunkLogged = true;
          recordLatencyLog("first-sse-chunk", interactionStartedAt, {
            chunkBytes: chunk.byteLength,
            totalBytes: chunk.totalBytes,
            streamElapsedMs: chunk.elapsedMs
          });
        }
      });
    } catch (error) {
      this.clearOpenAIAbortController(abortController);
      recordLatencyLog("openai-stream-error", interactionStartedAt, {
        error: getErrorMessage(error),
        sseChunkCount,
        sseEventCount,
        sseTotalBytes
      });
      console.warn("[Barkan] openai stream failed", error);
      throw error;
    }

    if (handledScroll) {
      recordLatencyLog("turn-paused-for-scroll-retry", interactionStartedAt, {
        sseChunkCount,
        sseEventCount,
        sseTotalBytes
      });
      this.clearOpenAIAbortController(abortController);
      return;
    }

    const finalChunk = chunker.flushRemaining(latestSpoken);
    if (finalChunk) {
      sendTtsChunk(finalChunk.text, true);
    }
    if (!latestSpoken.trim()) {
      this.clearOpenAIAbortController(abortController);
      if (renderedQuestionEvent) {
        this.commitOpenAIResponseId(receivedOpenAIResponseId ?? this.pendingOpenAIResponseId);
        recordLatencyLog("turn-complete-question-only", interactionStartedAt, {
          sseChunkCount,
          sseEventCount,
          sseTotalBytes,
          receivedOpenAIResponseId: receivedOpenAIResponseId ?? this.pendingOpenAIResponseId ?? null
        });
        const readyTtsPlayer = await ttsReady;
        readyTtsPlayer?.close();
        return;
      }
      throw new Error("OpenAI returned no spoken text.");
    }

    if (!this.pendingGuidanceClick && shouldInferFurtherGuidanceFromSpokenText(latestSpoken)) {
      const inferredCandidate =
        guidancePointCandidate ?? inferGuidanceOpenerFromSpokenText(pageContext, turn.transcript, latestSpoken);
      if (inferredCandidate) {
        const inferredPointTarget = resolvePointTarget(pageContext, inferredCandidate.elementId);
        window.__BARKAN_DEBUG__ = {
          ...(window.__BARKAN_DEBUG__ ?? {}),
          lastGuidanceInference: {
            spokenText: latestSpoken,
            elementId: inferredCandidate.elementId,
            label: inferredCandidate.label
          }
        };
        if (!inferredPointTarget) {
          this.recordDebugEvent("guidance-inference-unresolved", inferredCandidate.elementId);
        } else {
          if (!hasPointed) {
            hasPointed = true;
            this.showAgentAtPoint(
              inferredPointTarget.x,
              inferredPointTarget.y,
              latestSpoken || inferredCandidate.label || ""
            );
          }
          this.armGuidanceClick(turn, pageContext, {
            elementId: inferredCandidate.elementId,
            label: inferredCandidate.label,
            instruction: latestSpoken
          });
        }
      }
    }

    this.rememberAssistantSpeech(latestSpoken);
    this.commitOpenAIResponseId(receivedOpenAIResponseId);
    this.setChatThinking(false);
    recordLatencyLog("turn-complete-text-ready", interactionStartedAt, {
      sseChunkCount,
      sseEventCount,
      sseTotalBytes,
      responseChars: latestSpoken.length,
      renderedQuestionEvent,
      hasPointed
    });
    if (streamingAssistantMessageId) {
      this.updateChatMessageText(streamingAssistantMessageId, latestSpoken);
    } else {
      streamingAssistantMessageId = this.appendChatMessage("assistant", latestSpoken, { allowDuplicate: true });
    }
    const readyTtsPlayer = await ttsReady;
    if (!this.isCurrentSession(turn.sessionId)) {
      readyTtsPlayer?.close();
      this.clearOpenAIAbortController(abortController);
      return;
    }

    if (shouldSpeakResponse) {
      const usedStreamingTts = (await readyTtsPlayer?.finishAndWaitForAudio()) ?? false;
      if (!usedStreamingTts && latestSpoken) {
        await this.playHttpTtsFallback(latestSpoken);
      } else {
        await readyTtsPlayer?.waitForPlaybackComplete();
      }
    }
    this.currentAssistantSpeech = "";

    this.persistCallState();
    if (pendingNavigation.current && this.isSafeSameOriginNavigation(pendingNavigation.current.route, turn)) {
      this.navigateAfterSpeech(pendingNavigation.current.route, turn, pageContext.snapshot.route);
      this.clearOpenAIAbortController(abortController);
      return;
    }
    await wait(350);
    this.clearOpenAIAbortController(abortController);
  }

  private commitOpenAIResponseId(responseId: string | null | undefined) {
    if (!responseId) {
      return;
    }

    this.lastOpenAIResponseId = responseId;
    this.pendingOpenAIResponseId = null;
    if (this.pendingClarificationContext && this.choicePromptMode === "question") {
      this.pendingClarificationContext = {
        ...this.pendingClarificationContext,
        previousResponseId: responseId
      };
    }
    window.__BARKAN_DEBUG__ = {
      ...(window.__BARKAN_DEBUG__ ?? {}),
      lastOpenAIResponseId: responseId
    };
    this.persistCallState();
  }

  private isSafeSameOriginNavigation(route: string, turn: CommittedTurn): boolean {
    const normalizedRoute = normalizeNavigationRoute(route);
    if (!normalizedRoute || normalizedRoute.includes(":") || turn.navigationContext?.navigationCount) {
      return false;
    }

    try {
      const targetUrl = new URL(normalizedRoute, window.location.href);
      return targetUrl.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  private navigateAfterSpeech(route: string, turn: CommittedTurn, previousRoute: string) {
    const normalizedRoute = normalizeNavigationRoute(route);
    if (!normalizedRoute) {
      return;
    }

    this.navigationContext = {
      originalPrompt: turn.historyTranscript ?? turn.transcript,
      targetRoute: normalizedRoute,
      previousRoute,
      navigationCount: (turn.navigationContext?.navigationCount ?? 0) + 1
    };
    this.persistCallState();
    window.location.assign(new URL(normalizedRoute, window.location.href).toString());
  }

	  private clearOpenAIAbortController(abortController: AbortController) {
	    if (this.activeOpenAIAbortController === abortController) {
	      this.activeOpenAIAbortController = null;
	    }
	  }

	  private armGuidanceClick(
	    turn: CommittedTurn,
	    pageContext: PageContext,
	    target: { elementId: string; label?: string; instruction: string }
	  ) {
	    const currentStep = turn.guidanceContext?.step ?? 0;
	    if (currentStep >= GUIDANCE_MAX_STEPS) {
	      this.cancelPendingGuidanceClick();
	      return;
	    }

	    const element = findGuidanceClickElement(pageContext, target.elementId);
	    if (!element || !resolvePointTarget(pageContext, target.elementId)) {
	      this.cancelPendingGuidanceClick();
	      return;
	    }

	    this.cancelPendingGuidanceClick();
	    const sessionId = turn.sessionId;
	    const originalPrompt = turn.guidanceContext?.originalPrompt ?? turn.historyTranscript ?? turn.transcript;
	    const nextStep = currentStep + 1;
	    const silentResponse = turn.silentResponse === true;
	    const onClick = () => {
	      const pending = this.pendingGuidanceClick;
	      if (!pending || pending.elementId !== target.elementId || !this.isCurrentSession(sessionId)) {
	        return;
	      }

	      this.recordDebugEvent("guidance-click", target.elementId);
	      const beforeClickSignature = buildDomCaptureSettleSignature(getCurrentRoute());
	      const clickSettleStartedAt = performance.now();
	      const settlePromise = waitForGuidanceClickDomSettle(beforeClickSignature);
	      element.removeEventListener("click", onClick, true);
	      pending.cleanup = () => undefined;
	      void settlePromise.catch(() => undefined).then(() => {
	        if (this.pendingGuidanceClick !== pending || !this.isCurrentSession(sessionId)) {
	          return;
	        }

	        this.pendingGuidanceClick = null;
	        this.recordDebugEvent("guidance-dom-settled", `${Math.round(performance.now() - clickSettleStartedAt)}ms`);
	        this.turnQueue.enqueue({
	          sessionId,
	          transcript: originalPrompt,
	          historyTranscript: originalPrompt,
	          scrollRetryCount: 0,
	          silentResponse,
	          guidanceContext: {
	            originalPrompt,
	            step: nextStep,
	            previousElementId: target.elementId,
	            previousElementLabel: target.label,
	            previousInstruction: target.instruction
	          }
	        });
	      });
	    };
	    const cleanup = () => element.removeEventListener("click", onClick, true);
	    element.addEventListener("click", onClick, { capture: true, once: true });
	    this.pendingGuidanceClick = {
	      sessionId,
	      elementId: target.elementId,
	      label: target.label,
	      instruction: target.instruction,
	      originalPrompt,
	      step: nextStep,
	      silentResponse,
	      cleanup
	    };
	    this.recordDebugEvent("guidance-armed", target.elementId);
	  }

	  private cancelPendingGuidanceClick() {
	    const pending = this.pendingGuidanceClick;
	    if (!pending) {
	      return;
	    }

	    pending.cleanup();
	    this.pendingGuidanceClick = null;
	  }

	  private async retryTurnAfterScroll(
    turn: CommittedTurn,
    ttsReady: Promise<RealtimeTtsPlayer | null>,
    scroll: () => Promise<boolean>
  ): Promise<boolean> {
    if (turn.scrollRetryCount >= 1 || !(await scroll())) {
      return false;
    }

    void ttsReady.then((player) => player?.close()).catch(() => undefined);
    this.turnQueue.enqueue({
      sessionId: turn.sessionId,
      transcript: turn.transcript,
      historyTranscript: turn.historyTranscript,
      scrollRetryCount: turn.scrollRetryCount + 1,
      navigationContext: turn.navigationContext,
      guidanceContext: turn.guidanceContext,
      silentResponse: turn.silentResponse
    });
    return true;
  }

  private async fetchJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`${path} failed ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  private prefetchRealtimeTokens() {
    this.prefetchSttToken();
    this.prefetchTtsToken();
  }

  private prefetchSttToken() {
    if (this.sttTokenPromise) {
      return;
    }

    this.sttTokenPromise = this.fetchJson<{ token: string }>("/api/widget/transcribe-realtime-token", {
      siteKey: this.siteKey
    })
      .then((payload) => payload.token)
      .catch((error) => {
        this.sttTokenPromise = null;
        throw error;
      });
    void this.sttTokenPromise.catch(() => undefined);
  }

  private async consumeSttToken(): Promise<string> {
    this.prefetchSttToken();
    const tokenPromise = this.sttTokenPromise!;
    this.sttTokenPromise = null;
    void tokenPromise.finally(() => this.prefetchSttToken()).catch(() => undefined);
    return tokenPromise;
  }

  private prefetchTtsToken() {
    if (this.ttsTokenPromise) {
      return;
    }

    this.ttsTokenPromise = this.fetchJson<TtsTokenConfig>("/api/widget/tts-websocket-token", {
      siteKey: this.siteKey
    }).catch((error) => {
      console.warn("[Barkan] tts token prefetch failed", error);
      return null;
    });
  }

  private async consumeTtsToken(): Promise<TtsTokenConfig | null> {
    this.prefetchTtsToken();
    const tokenPromise = this.ttsTokenPromise!;
    this.ttsTokenPromise = null;
    void tokenPromise.finally(() => this.prefetchTtsToken()).catch(() => undefined);
    return tokenPromise;
  }

  private async prepareTtsPlayer(): Promise<RealtimeTtsPlayer | null> {
    const ttsConfig = await this.consumeTtsToken();
    this.activeTts?.close();
    const player = ttsConfig ? new RealtimeTtsPlayer(ttsConfig, this.consumePrimedAudioPlayback()) : null;
    this.activeTts = player;
    await player?.start();
    if (this.activeTts !== player) {
      player?.close();
      return null;
    }
    return player;
  }

  private primeBrowserAudio() {
    this.primeAudioPlayback();
    this.primeInputAudioContext();
  }

  private primeAudioPlayback() {
    if (this.primedTtsAudio) {
      return;
    }

    const audio = new Audio(SILENT_WAV_DATA_URL);
    audio.preload = "auto";
    audio.volume = 0;
    audio.setAttribute("playsinline", "true");
    this.primedTtsAudio = audio;

    void audio
      .play()
      .then(() => {
        if (this.primedTtsAudio === audio) {
          audio.pause();
          audio.currentTime = 0;
        }
        audio.volume = 1;
        this.recordDebugEvent("audio-playback-primed");
      })
      .catch((error) => {
        this.recordDebugEvent("audio-playback-prime-failed", getErrorMessage(error));
      });
  }

  private consumePrimedAudioPlayback(): HTMLAudioElement | undefined {
    const audio = this.primedTtsAudio;
    this.primedTtsAudio = null;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    }
    return audio ?? undefined;
  }

  private primeInputAudioContext() {
    if (this.primedInputAudioContext) {
      return;
    }

    try {
      const audioContext = new AudioContext();
      this.primedInputAudioContext = audioContext;
      void audioContext
        .resume()
        .then(() => this.recordDebugEvent("input-audio-context-primed", audioContext.state))
        .catch((error) => this.recordDebugEvent("input-audio-context-prime-failed", getErrorMessage(error)));
    } catch (error) {
      this.recordDebugEvent("input-audio-context-prime-failed", getErrorMessage(error));
    }
  }

  private consumePrimedInputAudioContext(): AudioContext | undefined {
    const audioContext = this.primedInputAudioContext;
    this.primedInputAudioContext = null;
    return audioContext?.state === "closed" ? undefined : audioContext ?? undefined;
  }

  private clearPrimedAudioResources() {
    this.primedTtsAudio?.pause();
    this.primedTtsAudio = null;
    void this.primedInputAudioContext?.close().catch(() => undefined);
    this.primedInputAudioContext = null;
  }

  private async speakLocalGreeting(sessionId: number) {
    const greeting = pickBarkanGreeting();
    this.currentAssistantSpeech = greeting;
    this.setState("speaking", greeting);
    let ttsPlayer: RealtimeTtsPlayer | null = null;
    try {
      ttsPlayer = await this.prepareTtsPlayer();
    } catch (error) {
      console.warn("[Barkan] greeting tts setup failed", error);
    }
    if (!this.isCurrentSession(sessionId) || this.state !== "speaking") {
      ttsPlayer?.close();
      if (this.activeTts === ttsPlayer) {
        this.activeTts = null;
      }
      return;
    }

    if (ttsPlayer) {
      ttsPlayer.sendText(greeting, true);
      const usedStreamingTts = await ttsPlayer.finishAndWaitForAudio();
      if (usedStreamingTts) {
        await ttsPlayer.waitForPlaybackComplete();
      } else {
        await this.playHttpTtsFallback(greeting);
      }
    } else {
      await this.playHttpTtsFallback(greeting);
    }

    if (this.isCurrentSession(sessionId) && this.state === "speaking") {
      this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
    }
    this.rememberAssistantSpeech(greeting);
    this.currentAssistantSpeech = "";
    if (this.activeTts === ttsPlayer) {
      this.activeTts = null;
    }
  }

  private async getMicrophoneStream(): Promise<MediaStream> {
    if (this.microphoneStream?.active) {
      this.microphoneStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      return this.microphoneStream;
    }

    this.microphoneStream = await navigator.mediaDevices.getUserMedia(MICROPHONE_AUDIO_CONSTRAINTS);
    return this.microphoneStream;
  }

  private stopMicrophoneStream() {
    this.activeMicrophoneStream?.getAudioTracks().forEach((track) => {
      track.stop();
    });
    if (this.microphoneStream === this.activeMicrophoneStream) {
      this.microphoneStream = null;
    }
    this.activeMicrophoneStream = null;
  }

  private async playHttpTtsFallback(text: string) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/widget/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteKey: this.siteKey, text })
      });

      if (!response.ok) {
        throw new Error(`/api/widget/tts failed ${response.status}: ${await response.text()}`);
      }

      const audioBlob = await response.blob();
      const audio = new Audio(URL.createObjectURL(audioBlob));
      this.activeHttpTts = audio;
      await this.playInterruptibleAudioUntilEnded(audio);
    } catch (error) {
      console.warn("[Barkan] tts fallback failed", error);
    } finally {
      this.activeHttpTts = null;
      this.activeHttpTtsStopper = null;
    }
  }

  private playInterruptibleAudioUntilEnded(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      let hasSettled = false;
      const settle = (callback: () => void) => {
        if (hasSettled) {
          return;
        }

        hasSettled = true;
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        if (this.activeHttpTts === audio) {
          this.activeHttpTtsStopper = null;
        }
        callback();
      };
      const onEnded = () => settle(resolve);
      const onError = () => settle(() => reject(new Error("audio playback failed")));
      this.activeHttpTtsStopper = () => {
        audio.pause();
        settle(resolve);
      };
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });
      void audio.play().catch((error) => settle(() => reject(error)));
    });
  }

  private async performScrollAction(
    action: { surfaceId: string; direction: "up" | "down" },
    pageContext: PageContext
  ): Promise<boolean> {
    const surface =
      action.surfaceId === "page"
        ? getPageScrollSurface()
        : pageContext.kind === "dom"
          ? pageContext.snapshot.scrollSurfaces.find((candidate) => candidate.id === action.surfaceId)
          : null;

    if (!surface || !canScrollSurface(surface, action.direction)) {
      return false;
    }

    const scrollableTarget = surface.kind === "page" ? window : findScrollableContainerById(surface.id);
    if (!scrollableTarget) {
      return false;
    }

    const distance = Math.max(120, Math.round(surface.clientHeight * 0.72));
    const top = action.direction === "down" ? distance : -distance;
    scrollableTarget.scrollBy({ top, behavior: "smooth" });
    await waitForScrollSettle(scrollableTarget, action.direction);
    return true;
  }

  private async performScrollToElement(elementId: string, pageContext: PageContext): Promise<ResolvedPointTarget | null> {
    if (pageContext.kind !== "dom") {
      return null;
    }

    const snapshotElement = findCleanDomElementById(pageContext.snapshot.elements, elementId);
    const snapshotFact = snapshotElement ? null : findSnapshotUiFactById(pageContext.snapshot, elementId);
    if (!snapshotElement && !snapshotFact) {
      return null;
    }

    if (snapshotElement && !isScrollRevealableCleanDomElement(snapshotElement)) {
      return null;
    }

    if (snapshotFact && (snapshotFact.rect.width < 1 || snapshotFact.rect.height < 1)) {
      return null;
    }

    const element = pageContext.targetElements.get(elementId);
    if (!element || !element.isConnected || hasHiddenAncestorForScrolling(element)) {
      return null;
    }

    const scrollContainer = findNearestVerticalScrollableAncestor(element);
    const horizontalState = captureHorizontalScrollState(scrollContainer);
    const initialElementRect = getElementViewportRect(element);

    if (scrollContainer) {
      if (hasHiddenAncestorForScrolling(scrollContainer)) {
        return null;
      }

      let containerRect = getElementViewportRect(scrollContainer);
      if (!isVerticallyVisibleInViewport(containerRect)) {
        const containerPageDelta = calculateVerticalRevealDelta(containerRect, 0, window.innerHeight);
        if (Math.abs(containerPageDelta) > 1) {
          const pageBeforeTop = getElementViewportRect(element).top;
          window.scrollBy({ top: containerPageDelta, behavior: "smooth" });
          await waitForElementScrollSettle(element, pageBeforeTop);
          restoreHorizontalScrollState(horizontalState);
          containerRect = getElementViewportRect(scrollContainer);
        }
      }

      if (!isActiveScrollRevealContainer(scrollContainer)) {
        restoreHorizontalScrollState(horizontalState);
        return null;
      }

      const delta = calculateVerticalRevealDelta(getElementViewportRect(element), containerRect.top, containerRect.height);
      if (Math.abs(delta) > 1) {
        const beforeTop = getElementViewportRect(element).top;
        scrollContainer.scrollBy({ top: delta, behavior: "smooth" });
        await waitForElementScrollSettle(element, beforeTop);
      }

      restoreHorizontalScrollState(horizontalState);
      return resolvePointTarget(pageContext, elementId);
    }

    const pageDelta = calculateVerticalRevealDelta(initialElementRect, 0, window.innerHeight);
    if (Math.abs(pageDelta) > 1) {
      window.scrollBy({ top: pageDelta, behavior: "smooth" });
      await waitForElementScrollSettle(element, initialElementRect.top);
    }
    restoreHorizontalScrollState(horizontalState);
    return resolvePointTarget(pageContext, elementId);
  }

  private stopSpeakingAudio() {
    this.rememberAssistantSpeech(this.currentAssistantSpeech);
    this.currentAssistantSpeech = "";
    this.activeTts?.close();
    this.activeTts = null;
    this.activeHttpTtsStopper?.();
    this.activeHttpTtsStopper = null;
    this.activeHttpTts?.pause();
    this.activeHttpTts = null;
  }

  private interruptCurrentSpeechForUserInput() {
    if (this.state !== "speaking") {
      return;
    }

    this.isSpeechInterruptedByUser = true;
    this.stopSpeakingAudio();
    this.activeOpenAIAbortController?.abort();
    this.setState("listening", "listening");
  }

  private resetPerMessageContextForFreshUserInput() {
    this.cancelPendingGuidanceClick();
    this.navigationContext = null;
    this.turnQueue.clear();
    if (this.choicePromptMode === "question") {
      this.clearActionChoices();
    }

    if (this.activeOpenAIAbortController) {
      this.isSpeechInterruptedByUser = true;
      this.activeOpenAIAbortController.abort();
    }

    this.stopSpeakingAudio();
    this.currentAssistantSpeech = "";
    if (this.state === "speaking") {
      this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
    }
    this.persistCallState();
  }

  private interruptCurrentSpeechForPartialTranscript(transcript: string) {
    if (this.state !== "speaking" || this.isMuted) {
      return;
    }

    const trimmedTranscript = transcript.trim();
    if (
      !isLikelyUserBargeInTranscript(trimmedTranscript) ||
      this.isLikelySelfEchoTranscript(trimmedTranscript) ||
      this.isRecentlyHandledUserTranscript(trimmedTranscript)
    ) {
      return;
    }

    this.interruptCurrentSpeechForUserInput();
  }

  private isLikelySelfEchoTranscript(transcript: string): boolean {
    return isLikelyAssistantEcho(transcript, this.getRecentAssistantSpeechSamples());
  }

  private getRecentAssistantSpeechSamples(): string[] {
    const now = performance.now();
    this.recentAssistantSpeech = this.recentAssistantSpeech.filter((entry) => entry.expiresAt > now);
    return [
      this.currentAssistantSpeech,
      ...this.recentAssistantSpeech.map((entry) => entry.text)
    ].filter((text) => text.trim().length > 0);
  }

  private rememberAssistantSpeech(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    const now = performance.now();
    this.recentAssistantSpeech = [
      { text: trimmedText, expiresAt: now + 12000 },
      ...this.recentAssistantSpeech.filter((entry) => entry.expiresAt > now && entry.text !== trimmedText)
    ].slice(0, 8);
  }

  private isRecentlyHandledUserTranscript(transcript: string): boolean {
    const normalizedTranscript = normalizeTranscript(transcript);
    if (!normalizedTranscript) {
      return false;
    }

    const now = performance.now();
    this.recentUserTranscripts = this.recentUserTranscripts.filter((entry) => entry.expiresAt > now);
    return this.recentUserTranscripts.some((entry) => areSimilarUserTranscripts(normalizedTranscript, entry.normalized));
  }

  private rememberUserTranscript(transcript: string) {
    const normalizedTranscript = normalizeTranscript(transcript);
    if (!normalizedTranscript) {
      return;
    }

    const now = performance.now();
    this.recentUserTranscripts = [
      { normalized: normalizedTranscript, expiresAt: now + 30000 },
      ...this.recentUserTranscripts.filter(
        (entry) => entry.expiresAt > now && !areSimilarUserTranscripts(normalizedTranscript, entry.normalized)
      )
    ].slice(0, 12);
  }

  private buildTranscriberCallbacks(sessionId: number): RealtimeTranscriberCallbacks {
    return {
      onCommittedTranscript: (transcript) => this.handleCommittedTranscript(sessionId, transcript),
      onPartialTranscript: (transcript) => {
        window.__BARKAN_DEBUG__ = {
          ...(window.__BARKAN_DEBUG__ ?? {}),
          lastTranscript: transcript
        };
        this.interruptCurrentSpeechForPartialTranscript(transcript);
      },
      onAudioLevel: (level, bands) => {
        this.updateWaveformLevel(level, bands);
      },
      onSessionClosed: () => {
        this.handleTranscriberClosed(sessionId);
      }
    };
  }

  private handleTranscriberClosed(sessionId: number) {
    if (!this.isCurrentSession(sessionId) || this.isMuted) {
      return;
    }

    this.activeTranscriber = null;
    void this.recoverMicrophonePipeline("transcriber closed");
  }

  private startMicrophoneHealthMonitor() {
    if (this.microphoneHealthTimer !== null) {
      return;
    }

    this.microphoneHealthTimer = window.setInterval(() => {
      this.ensureMicrophoneCaptureHealthy();
    }, 2000);
  }

  private stopMicrophoneHealthMonitor() {
    if (this.microphoneHealthTimer === null) {
      return;
    }

    window.clearInterval(this.microphoneHealthTimer);
    this.microphoneHealthTimer = null;
  }

  private async ensureMicrophoneCaptureHealthy() {
    if (!this.shouldCaptureMicrophone()) {
      return;
    }

    if (!this.hasLiveMicrophoneStream()) {
      void this.recoverMicrophonePipeline("microphone stream ended");
      return;
    }

    if (this.activeTranscriber && (await this.activeTranscriber.ensureReadyForInput())) {
      return;
    }

    void this.recoverMicrophonePipeline(this.activeTranscriber ? "transcriber health check" : "missing transcriber");
  }

  private toggleMute() {
    if (!this.isCallActive) {
      return;
    }

    this.isMuted = !this.isMuted;
    if (!this.isMuted && this.isTextModeActive) {
      this.setTextModeActive(false);
    }
    this.applyMicrophoneCaptureState();

    if (this.state === "listening" || this.state === "muted") {
      this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
    }
    this.updateTextModeUi();
    this.persistCallState();
  }

  private resumeMicrophoneCapture() {
    this.applyMicrophoneCaptureState();
  }

  private applyMicrophoneCaptureState() {
    const shouldCapture = this.shouldCaptureMicrophone();
    if (this.isMuted) {
      this.releaseMicrophoneCapture();
    } else {
      this.activeTranscriber?.setInputEnabled(shouldCapture);
      this.activeMicrophoneStream?.getAudioTracks().forEach((track) => {
        track.enabled = shouldCapture;
      });
    }
    if (!shouldCapture) {
      this.updateWaveformLevel(0);
    } else if (!this.activeTranscriber) {
      void this.recoverMicrophonePipeline("missing transcriber");
    }
    this.callControl.dataset.muted = this.isMuted ? "true" : "false";
    this.micButton.setAttribute("aria-label", this.isMuted ? "Unmute microphone" : "Mute microphone");
    this.micButton.title = this.isMuted ? "Unmute microphone" : "Mute microphone";
  }

  private releaseMicrophoneCapture() {
    this.activeTranscriber?.stop();
    this.activeTranscriber = null;
    this.stopMicrophoneStream();
  }

  private shouldCaptureMicrophone(): boolean {
    return this.isCallActive && !this.isMuted && this.state !== "thinking" && this.state !== "error";
  }

  private async recoverMicrophonePipeline(reason: MicrophoneRecoveryReason) {
    if (this.microphoneRecoveryPromise) {
      return this.microphoneRecoveryPromise;
    }

    this.microphoneRecoveryPromise = this.recoverMicrophonePipelineNow(reason).finally(() => {
      this.microphoneRecoveryPromise = null;
    });
    return this.microphoneRecoveryPromise;
  }

  private async recoverMicrophonePipelineNow(reason: MicrophoneRecoveryReason) {
    if (!this.isCallActive || this.isMuted) {
      return;
    }

    const sessionId = this.callSessionId;
    try {
      window.__BARKAN_DEBUG__ = {
        ...(window.__BARKAN_DEBUG__ ?? {}),
        lastMicRecovery: reason
      };

      if (!this.hasLiveMicrophoneStream()) {
        await this.reacquireMicrophoneStream(sessionId);
      }

      if (!this.isCurrentSession(sessionId) || this.isMuted) {
        this.stopMicrophoneStream();
        return;
      }

      await this.reconnectTranscriptionSession(sessionId);
    } catch (error) {
      this.activeTranscriber?.stop();
      this.activeTranscriber = null;
      if (!this.hasLiveMicrophoneStream()) {
        this.stopMicrophoneStream();
      }
      console.warn("[Barkan] microphone recovery failed", error);
      this.showError("microphone blocked");
    }
  }

  private async reacquireMicrophoneStream(sessionId: number) {
    this.stopMicrophoneStream();
    const stream = await this.getMicrophoneStream();
    this.activeMicrophoneStream = stream;
    this.watchMicrophoneTrackEnd(stream, sessionId);
  }

  private async reconnectTranscriptionSession(sessionId: number) {
    const stream = this.activeMicrophoneStream;
    if (!stream || !this.hasLiveMicrophoneStream()) {
      throw new Error("microphone stream unavailable");
    }

    const token = await this.consumeSttToken();
    if (!this.isCurrentSession(sessionId) || this.isMuted) {
      return;
    }

    this.activeTranscriber?.stop();
    const transcriber = new RealtimeTranscriber(token, stream, this.buildTranscriberCallbacks(sessionId));
    this.activeTranscriber = transcriber;
    await transcriber.start();
    if (!this.isCurrentSession(sessionId) || this.isMuted || this.activeTranscriber !== transcriber) {
      transcriber.stop();
      return;
    }

    this.applyMicrophoneCaptureState();
  }

  private watchMicrophoneTrackEnd(stream: MediaStream, sessionId: number) {
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener(
        "ended",
        () => {
          if (this.activeMicrophoneStream === stream && this.isCurrentSession(sessionId) && !this.isMuted) {
            void this.recoverMicrophonePipeline("microphone track ended");
          }
        },
        { once: true }
      );
    });
  }

  private hasLiveMicrophoneStream(): boolean {
    return Boolean(
      this.activeMicrophoneStream?.active &&
        this.activeMicrophoneStream.getAudioTracks().some((track) => track.readyState === "live")
    );
  }

  private isCurrentSession(sessionId: number): boolean {
    return this.isCallActive && this.callSessionId === sessionId;
  }

  private setState(state: VoiceState, message: string) {
    this.state = state;
    this.callControl.dataset.state = state;
    this.updateCallControlVisibility();
    this.callControl.dataset.muted = this.isMuted ? "true" : "false";
    this.callStatus.textContent = message;
    this.recordStateChange(state, message);
    if (state === "idle" || state === "thinking" || state === "speaking" || state === "error") {
      this.updateWaveformLevel(0);
    }
    this.persistCallState();
  }

  private updateCallControlVisibility() {
    const shouldShowCallControl = (this.isCallActive || this.state === "error") && !this.isTextModeActive;
    this.callControl.dataset.visible = shouldShowCallControl ? "true" : "false";
    this.updateLauncherVisibility();
  }

  private showError(message: string) {
    window.__BARKAN_DEBUG__ = {
      ...(window.__BARKAN_DEBUG__ ?? {}),
      lastError: message
    };
    this.setState("error", message);
    window.setTimeout(() => {
      if (this.state !== "error") {
        return;
      }

      if (this.isCallActive) {
        this.setState(this.isMuted ? "muted" : "listening", this.isMuted ? "muted" : "listening");
        this.resumeMicrophoneCapture();
      } else {
        this.setState("idle", "");
      }
    }, 1800);
  }

  private recordStateChange(state: VoiceState, message: string) {
    const stateHistory = [
      ...(window.__BARKAN_DEBUG__?.stateHistory ?? []),
      { state, message, isCallActive: this.isCallActive, at: Math.round(performance.now()) }
    ].slice(-20);
    window.__BARKAN_DEBUG__ = {
      ...(window.__BARKAN_DEBUG__ ?? {}),
      stateHistory
    };
  }

  private recordDebugEvent(name: string, detail?: string) {
    recordGlobalDebugEvent(name, detail);
  }

  private showAgentAtPoint(x: number, y: number, text: string) {
    this.agentTarget = { x, y };
    this.setAgentText(text);
    this.positionAgentAtTarget();
    this.agent.dataset.visible = "true";
    this.agent.setAttribute("aria-hidden", "false");
    if (this.lastMousePosition) {
      this.updateAgentPointerHover(this.lastMousePosition.x, this.lastMousePosition.y);
    }
  }

  private hideAgent() {
    this.agentTarget = null;
    this.agent.dataset.visible = "false";
    this.agent.setAttribute("aria-hidden", "true");
    this.agentBubble.textContent = "";
    this.agentBubble.dataset.empty = "true";
  }

  private setAgentText(text: string) {
    const trimmedText = text.trim();
    this.agentBubble.textContent = trimmedText;
    this.agentBubble.dataset.empty = trimmedText ? "false" : "true";
    this.positionAgentAtTarget();
  }

  private positionAgentAtTarget() {
    if (!this.agentTarget) {
      return;
    }

    this.agent.style.width = "";
    this.agent.style.height = "";
    const bubbleRect = this.agentBubble.getBoundingClientRect();
    const availableViewport = this.getAgentAvailableViewport();
    const target = {
      x: Math.min(Math.max(this.agentTarget.x, 12), availableViewport.width - 12),
      y: this.agentTarget.y
    };
    const position = placeAgentNearTarget(
      target,
      availableViewport,
      { width: bubbleRect.width, height: bubbleRect.height }
    );
    this.agent.dataset.placement = position.placement;
    this.agent.style.width = `${position.width}px`;
    this.agent.style.height = `${position.height}px`;
    this.agent.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    if (this.lastMousePosition) {
      this.updateAgentPointerHover(this.lastMousePosition.x, this.lastMousePosition.y);
    }
  }

  private getAgentAvailableViewport(): ViewportSize {
    if (!this.isTextModeActive) {
      return { width: window.innerWidth, height: window.innerHeight };
    }

    const reservedWidth = this.getChatSidebarReservedWidth();
    return {
      width: Math.max(320, window.innerWidth - reservedWidth),
      height: window.innerHeight
    };
  }

  private updateAgentPointerHover(x: number, y: number) {
    if (this.agent.dataset.visible !== "true") {
      return;
    }

    const pointerRect = this.agentPointer.getBoundingClientRect();
    const isHoveringPointer =
      x >= pointerRect.left && x <= pointerRect.right && y >= pointerRect.top && y <= pointerRect.bottom;
    if (isHoveringPointer) {
      this.dismissAgent();
    }
  }

  private dismissAgent() {
    this.agent.dataset.visible = "false";
    this.agent.setAttribute("aria-hidden", "true");
  }

  private updateWaveformLevel(level: number, bands?: number[]) {
    const clampedLevel = Math.max(0, Math.min(1, level));
    if (!bands && Math.abs(clampedLevel - this.lastWaveformLevel) < 0.025) {
      return;
    }

    this.lastWaveformLevel = clampedLevel;
    this.waveformTargetScales = this.waveformBars.map((_bar, index) => {
      const weight = WAVEFORM_BAR_WEIGHTS[index] ?? 0.7;
      const barLevel = bands?.[index] ?? clampedLevel;
      return WAVEFORM_BASE_SCALE + Math.max(0, Math.min(1, barLevel)) * weight;
    });
    this.ensureWaveformAnimation();
  }

  private ensureWaveformAnimation() {
    if (this.waveformAnimationId !== null) {
      return;
    }

    const animate = () => {
      let isSettled = true;
      this.waveformBars.forEach((bar, index) => {
        const currentScale = this.waveformCurrentScales[index] ?? WAVEFORM_BASE_SCALE;
        const targetScale = this.waveformTargetScales[index] ?? WAVEFORM_BASE_SCALE;
        const nextScale = currentScale + (targetScale - currentScale) * 0.22;
        this.waveformCurrentScales[index] = nextScale;
        bar.style.transform = `scaleY(${nextScale.toFixed(3)})`;
        if (Math.abs(nextScale - targetScale) > 0.006) {
          isSettled = false;
        }
      });

      if (isSettled) {
        this.waveformCurrentScales = [...this.waveformTargetScales];
        this.waveformBars.forEach((bar, index) => {
          bar.style.transform = `scaleY(${(this.waveformCurrentScales[index] ?? WAVEFORM_BASE_SCALE).toFixed(3)})`;
        });
        this.waveformAnimationId = null;
        return;
      }

      this.waveformAnimationId = window.requestAnimationFrame(animate);
    };

    this.waveformAnimationId = window.requestAnimationFrame(animate);
  }
}

interface RealtimeTranscriberCallbacks {
  onCommittedTranscript: (transcript: string) => void;
  onPartialTranscript?: (transcript: string) => void;
  onAudioLevel?: (level: number, bands: number[]) => void;
  onSessionClosed?: () => void;
}

class RealtimeTranscriber {
  private readonly token: string;
  private readonly stream: MediaStream;
  private readonly callbacks: RealtimeTranscriberCallbacks;
  private readonly primedAudioContext?: AudioContext;
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private inputEnabled = true;
  private isStopped = false;
  private latestPartialTranscript = "";
  private lastEmittedTranscript = "";
  private lastVoiceActivityAt = 0;
  private fallbackCommitTimer: number | null = null;

  constructor(
    token: string,
    stream: MediaStream,
    callbacks: RealtimeTranscriberCallbacks,
    primedAudioContext?: AudioContext
  ) {
    this.token = token;
    this.stream = stream;
    this.callbacks = callbacks;
    this.primedAudioContext = primedAudioContext;
  }

  async start() {
    this.isStopped = false;
    this.lastVoiceActivityAt = performance.now();
    this.socket = new WebSocket(buildRealtimeSttUrl(this.token));

    this.socket.addEventListener("message", (event) => this.handleMessage(event));
    this.socket.addEventListener("error", (event) => {
      console.warn("[Barkan] realtime transcription socket error", event);
    });
    this.socket.addEventListener("close", (event) => {
      this.cleanupAudioPipeline();
      if (event.code !== 1000 && event.code !== 1005) {
        console.warn("[Barkan] realtime transcription socket closed", {
          code: event.code,
          reason: event.reason
        });
      }
      if (!this.isStopped) {
        this.callbacks.onSessionClosed?.();
      }
    });
    await waitForSocketOpen(this.socket);

    this.audioContext =
      this.primedAudioContext && this.primedAudioContext.state !== "closed"
        ? this.primedAudioContext
        : new AudioContext();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume().catch(() => undefined);
    }
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (this.socket?.readyState !== WebSocket.OPEN || !this.audioContext || !this.inputEnabled) {
        this.callbacks.onAudioLevel?.(0, []);
        return;
      }

      const inputBuffer = event.inputBuffer.getChannelData(0);
      const audioLevel = normalizeAudioLevel(inputBuffer);
      const audioBands = normalizeAudioBands(inputBuffer, 9);
      const wasSpeakingRecently = performance.now() - this.lastVoiceActivityAt < RECENT_VOICE_ACTIVITY_MS;
      if (audioLevel > VOICE_ACTIVITY_LEVEL_THRESHOLD) {
        this.lastVoiceActivityAt = performance.now();
      }
      this.callbacks.onAudioLevel?.(audioLevel, audioBands);

      const pcm = downsampleToPcm16(inputBuffer, this.audioContext.sampleRate, REALTIME_STT_SAMPLE_RATE);
      this.socket.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
          sample_rate: REALTIME_STT_SAMPLE_RATE
        })
      );
      this.maybeCommitPartialAfterSilence();
      if (wasSpeakingRecently && audioLevel <= SILENCE_LEVEL_THRESHOLD) {
        this.socket.send(
          JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: createSilencePcmBase64(REALTIME_STT_SAMPLE_RATE, VAD_NUDGE_SILENCE_MS),
            sample_rate: REALTIME_STT_SAMPLE_RATE
          })
        );
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
  }

  isReadyForInput(): boolean {
    return (
      !this.isStopped &&
      this.inputEnabled &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.audioContext?.state === "running" &&
      this.stream.active &&
      this.stream.getAudioTracks().some((track) => track.readyState === "live" && track.enabled)
    );
  }

  async ensureReadyForInput(): Promise<boolean> {
    if (
      this.isStopped ||
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.stream.active ||
      !this.stream.getAudioTracks().some((track) => track.readyState === "live" && track.enabled)
    ) {
      return false;
    }

    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume().catch(() => undefined);
    }

    return this.isReadyForInput();
  }

  stop() {
    this.isStopped = true;
    this.clearFallbackCommitTimer();
    this.cleanupAudioPipeline();
    this.socket?.close();
  }

  private cleanupAudioPipeline() {
    this.clearFallbackCommitTimer();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
  }

  private handleMessage(event: MessageEvent) {
    if (this.isStopped) {
      return;
    }

    try {
      const message = JSON.parse(String(event.data)) as {
        text?: string;
        transcript?: string;
        message_type?: string;
        error?: string;
      };
      if (message.message_type?.includes("error") || message.error) {
        console.warn("[Barkan] realtime transcription error", message);
        return;
      }

      const transcript = message.text || message.transcript || "";
      if (!transcript.trim()) {
        return;
      }

      if (message.message_type === "committed_transcript" || message.message_type === "committed_transcript_with_timestamps") {
        this.emitCommittedTranscript(transcript);
      } else {
        this.latestPartialTranscript = transcript;
        this.scheduleFallbackCommitCheck();
        this.callbacks.onPartialTranscript?.(transcript);
      }
    } catch {
    }
  }

  private maybeCommitPartialAfterSilence() {
    if (this.isStopped) {
      return;
    }

    if (!this.latestPartialTranscript.trim()) {
      return;
    }

    if (performance.now() - this.lastVoiceActivityAt < FALLBACK_PARTIAL_COMMIT_MS) {
      return;
    }

    this.emitCommittedTranscript(this.latestPartialTranscript);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: createSilencePcmBase64(REALTIME_STT_SAMPLE_RATE, FORCED_COMMIT_SILENCE_MS),
          commit: true,
          sample_rate: REALTIME_STT_SAMPLE_RATE
        })
      );
    }
  }

  private scheduleFallbackCommitCheck() {
    if (this.fallbackCommitTimer !== null) {
      return;
    }

    this.fallbackCommitTimer = window.setTimeout(() => {
      this.fallbackCommitTimer = null;
      this.maybeCommitPartialAfterSilence();
      if (this.latestPartialTranscript.trim()) {
        this.scheduleFallbackCommitCheck();
      }
    }, FALLBACK_COMMIT_CHECK_MS);
  }

  private emitCommittedTranscript(transcript: string) {
    if (this.isStopped) {
      return;
    }

    const normalizedTranscript = normalizeTranscript(transcript);
    if (!normalizedTranscript || normalizedTranscript === this.lastEmittedTranscript) {
      return;
    }

    this.lastEmittedTranscript = normalizedTranscript;
    this.latestPartialTranscript = "";
    this.clearFallbackCommitTimer();
    this.callbacks.onCommittedTranscript(transcript);
  }

  private clearFallbackCommitTimer() {
    if (this.fallbackCommitTimer !== null) {
      window.clearTimeout(this.fallbackCommitTimer);
      this.fallbackCommitTimer = null;
    }
  }
}

class RealtimeTtsPlayer {
  private readonly config: { token: string; voiceId: string; modelId: string; outputFormat: string };
  private readonly audio: HTMLAudioElement;
  private socket: WebSocket | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private readonly pendingAudioChunks: Uint8Array[] = [];
  private isMediaOpen = false;
  private hasReceivedAudio = false;
  private hasFinishedInput = false;
  private hasClosed = false;
  private playbackCompleted = false;
  private audioArrivalResolver: ((hasAudio: boolean) => void) | null = null;
  private playbackResolver: (() => void) | null = null;

  constructor(config: { token: string; voiceId: string; modelId: string; outputFormat: string }, audio?: HTMLAudioElement) {
    this.config = config;
    this.audio = audio ?? new Audio();
  }

  async start() {
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);
    this.audio.addEventListener("ended", () => this.markPlaybackCompleted());
    this.mediaSource.addEventListener("sourceopen", () => {
      if (!this.mediaSource) {
        return;
      }

      this.isMediaOpen = true;
      this.sourceBuffer = this.mediaSource.addSourceBuffer("audio/mpeg");
      this.sourceBuffer.addEventListener("updateend", () => this.flushAudioQueue());
      this.flushAudioQueue();
    });

    this.socket = new WebSocket(
      `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        this.config.voiceId
      )}/stream-input?model_id=${encodeURIComponent(this.config.modelId)}&output_format=${encodeURIComponent(
        this.config.outputFormat
      )}&single_use_token=${encodeURIComponent(this.config.token)}&inactivity_timeout=60`
    );
    this.socket.addEventListener("message", (event) => this.handleMessage(event));
    this.socket.addEventListener("error", (event) => {
      console.warn("[Barkan] tts websocket error", event);
    });
    this.socket.addEventListener("close", (event) => {
      this.hasClosed = true;
      if (!this.hasReceivedAudio || (event.code !== 1000 && event.code !== 1005)) {
        console.warn("[Barkan] tts websocket closed", {
          code: event.code,
          reason: event.reason,
          hasReceivedAudio: this.hasReceivedAudio
        });
      }
      this.audioArrivalResolver?.(this.hasReceivedAudio);
    });
    await waitForSocketOpen(this.socket);
    this.socket.send(
      JSON.stringify({
        text: " ",
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
        generation_config: { chunk_length_schedule: [80, 120, 160, 220] }
      })
    );
    void this.audio
      .play()
      .then(() => recordGlobalDebugEvent("tts-audio-play-started"))
      .catch((error) => {
        console.warn("[Barkan] tts audio playback blocked", error);
        recordGlobalDebugEvent("tts-audio-play-failed", getErrorMessage(error));
      });
  }

  sendText(text: string, flush: boolean) {
    if (!text.trim() || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ text, flush }));
  }

  async finishAndWaitForAudio(): Promise<boolean> {
    this.hasFinishedInput = true;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ text: "" }));
    }

    if (this.hasReceivedAudio) {
      return true;
    }

    if (this.hasClosed) {
      return false;
    }

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.audioArrivalResolver = null;
        resolve(this.hasReceivedAudio);
      }, 1400);

      this.audioArrivalResolver = (hasAudio) => {
        window.clearTimeout(timeoutId);
        this.audioArrivalResolver = null;
        resolve(hasAudio);
      };
    });
  }

  close() {
    this.hasClosed = true;
    this.playbackCompleted = true;
    this.socket?.close();
    this.audio.pause();
    this.audioArrivalResolver?.(this.hasReceivedAudio);
    this.playbackResolver?.();
    this.audioArrivalResolver = null;
    this.playbackResolver = null;
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(String(event.data)) as { audio?: string; isFinal?: boolean };
      if (message.audio) {
        this.hasReceivedAudio = true;
        this.audioArrivalResolver?.(true);
        this.pendingAudioChunks.push(base64ToBytes(message.audio));
        this.flushAudioQueue();
      }

      if (message.isFinal && this.mediaSource?.readyState === "open") {
        window.setTimeout(() => {
          if (this.mediaSource?.readyState === "open" && !this.sourceBuffer?.updating) {
            this.mediaSource.endOfStream();
          }
        }, 250);
      }
    } catch {
    }
  }

  private flushAudioQueue() {
    if (!this.isMediaOpen || !this.sourceBuffer || this.sourceBuffer.updating) {
      return;
    }

    const nextChunk = this.pendingAudioChunks.shift();
    if (!nextChunk) {
      if (
        this.hasFinishedInput &&
        this.hasReceivedAudio &&
        this.mediaSource?.readyState === "open" &&
        !this.sourceBuffer.updating
      ) {
        try {
          this.mediaSource.endOfStream();
        } catch {
        }
      }
      return;
    }

    const stableChunk = nextChunk.buffer.slice(
      nextChunk.byteOffset,
      nextChunk.byteOffset + nextChunk.byteLength
    ) as ArrayBuffer;
    this.sourceBuffer.appendBuffer(stableChunk);
  }

  waitForPlaybackComplete(): Promise<void> {
    if (!this.hasReceivedAudio || this.playbackCompleted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.playbackResolver = null;
        resolve();
      }, 12000);

      this.playbackResolver = () => {
        window.clearTimeout(timeoutId);
        this.playbackResolver = null;
        resolve();
      };
    });
  }

  private markPlaybackCompleted() {
    this.playbackCompleted = true;
    this.playbackResolver?.();
  }
}

async function capturePageContext(
  userPrompt: string,
  startedAt = performance.now()
): Promise<PageContext> {
  const layoutStartedAt = performance.now();
  await waitForStableLayout();
  let layoutSettleMs = Math.round(performance.now() - layoutStartedAt);
  let pageContext = captureDomSnapshot(userPrompt, startedAt, {
    layoutSettleMs,
    staleRetryCount: 0
  });
  for (let attempt = 0; attempt < DOM_CAPTURE_MAX_STALE_RETRIES && isDomSnapshotProbablyStale(pageContext.snapshot); attempt++) {
    await wait(DOM_CAPTURE_STALE_RETRY_DELAY_MS);
    const retryLayoutStartedAt = performance.now();
    await waitForStableLayout({ retry: true });
    layoutSettleMs += Math.round(performance.now() - retryLayoutStartedAt) + DOM_CAPTURE_STALE_RETRY_DELAY_MS;
    pageContext = captureDomSnapshot(userPrompt, startedAt, {
      layoutSettleMs,
      staleRetryCount: attempt + 1
    });
  }
  return pageContext;
}

function captureDomSnapshot(
  userPrompt: string,
  startedAt = performance.now(),
  timingContext: { layoutSettleMs?: number; staleRetryCount?: number } = {}
): DomPageContext {
  const snapshotBuildStartedAt = performance.now();
  const candidateCollectionStartedAt = performance.now();
  const candidates = collectDomCaptureCandidates();
  const candidateCollectionMs = Math.round(performance.now() - candidateCollectionStartedAt);

  const scrollSurfaceMap = new Map<Element, string>();
  const targetElements = new Map<string, HTMLElement>();
  const scrollSurfacesStartedAt = performance.now();
  const scrollSurfaces = collectScrollSurfaces(scrollSurfaceMap, candidates);
  const scrollSurfacesMs = Math.round(performance.now() - scrollSurfacesStartedAt);

  const activeSurfacesStartedAt = performance.now();
  const activeSurfaceDrafts = collectActiveSurfaceDrafts(candidates.slice(0, DOM_CAPTURE_ACTIVE_SURFACE_CANDIDATE_LIMIT));
  const activeSurfacesMs = Math.round(performance.now() - activeSurfacesStartedAt);

  const uiFactsStartedAt = performance.now();
  const uiFactCollection = collectDomUiFacts(
    candidates,
    userPrompt,
    scrollSurfaceMap,
    activeSurfaceDrafts,
    targetElements
  );
  const uiFactsCreationMs = Math.round(performance.now() - uiFactsStartedAt);

  const activeSurfaces = finalizeActiveSurfaces(activeSurfaceDrafts);
  const route = getCurrentRoute();
  const cleanDomTreeStartedAt = performance.now();
  const elements = collectCleanDomTree(document.body, targetElements, candidates);
  const cleanDomTreeMs = Math.round(performance.now() - cleanDomTreeStartedAt);

  const pageMetaStartedAt = performance.now();
  const pageMeta = collectPageMeta(
    route,
    candidates,
    uiFactCollection.uiFacts,
    activeSurfaces,
    uiFactCollection.elementToFactId
  );
  const pageMetaMs = Math.round(performance.now() - pageMetaStartedAt);

  const optionalContextBudgetMs = getOptionalContextBudgetMs(userPrompt);
  const optionalContextSkipped = performance.now() - snapshotBuildStartedAt > optionalContextBudgetMs;
  const contentBlocksStartedAt = performance.now();
  const contentBlocks = optionalContextSkipped ? [] : collectContentBlocks(candidates, uiFactCollection.pairs, userPrompt);
  const contentBlocksMs = Math.round(performance.now() - contentBlocksStartedAt);

  const formsSkipped = optionalContextSkipped || performance.now() - snapshotBuildStartedAt > optionalContextBudgetMs;
  const formsStartedAt = performance.now();
  const forms = formsSkipped ? [] : collectFormSummaries(candidates, uiFactCollection.elementToFactId);
  const formsMs = Math.round(performance.now() - formsStartedAt);

  const relationshipsSkipped = formsSkipped || performance.now() - snapshotBuildStartedAt > optionalContextBudgetMs;
  const relationshipsStartedAt = performance.now();
  const relationships = relationshipsSkipped
    ? []
    : collectDomRelationships(candidates, uiFactCollection.pairs, uiFactCollection.elementToFactId);
  const relationshipsMs = Math.round(performance.now() - relationshipsStartedAt);

  return {
    kind: "dom",
    snapshot: {
      captureVersion: WIDGET_BUILD_ID,
      route,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      title: document.title || undefined,
      elements,
      uiFacts: uiFactCollection.uiFacts,
      offscreenUiFacts: uiFactCollection.offscreenUiFacts,
      scrollSurfaces,
      ...(activeSurfaces.length > 0 ? { activeSurfaces } : {}),
      markers: deriveDomSnapshotMarkers(uiFactCollection.uiFacts, activeSurfaces),
      contentBlocks,
      forms,
      relationships,
      pageMeta
    },
    targetElements,
    debugTimings: {
      contextCaptureMs: Math.round(performance.now() - startedAt),
      candidateCollectionMs,
      scrollSurfacesMs,
      activeSurfacesMs,
      uiFactsCreationMs,
      cleanDomTreeMs,
      pageMetaMs,
      contentBlocksMs,
      formsMs,
      relationshipsMs,
      domSnapshotBuildMs: Math.round(performance.now() - snapshotBuildStartedAt),
      optionalContextSkipped: optionalContextSkipped ? 1 : 0,
      layoutSettleMs: timingContext.layoutSettleMs ?? 0,
      staleRetryCount: timingContext.staleRetryCount ?? 0
    }
  };
}

function collectDomCaptureCandidates(): HTMLElement[] {
  return collectComposedDomCandidates(
    document.body,
    DOM_CAPTURE_CANDIDATE_LIMIT,
    (element) => isBarkanWidgetElement(element) || isDefinitelyIgnoredDomTag(element)
  );
}

function getOptionalContextBudgetMs(userPrompt: string): number {
  return shouldPrioritizeOptionalDomContext(userPrompt)
    ? DOM_CAPTURE_IMPORTANT_OPTIONAL_CONTEXT_BUDGET_MS
    : DOM_CAPTURE_OPTIONAL_CONTEXT_BUDGET_MS;
}

function shouldPrioritizeOptionalDomContext(userPrompt: string): boolean {
  return /\b(form|field|input|type|enter|fill|submit|select|choose|login|sign ?in|signup|sign ?up|password|email|checkout|billing|profile|settings?|modal|dialog|popup|save|edit|create|add)\b/i.test(
    userPrompt
  );
}

function collectLivePrimaryInteractiveDomElements(candidates: HTMLElement[] = []): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const seen = new WeakSet<HTMLElement>();
  const addElement = (element: Element | null | undefined) => {
    if (!isHtmlElement(element) || seen.has(element) || isBarkanWidgetElement(element)) {
      return;
    }

    if (!isPrimaryInteractiveDomElement(element)) {
      return;
    }

    seen.add(element);
    elements.push(element);
  };

  for (const candidate of candidates) {
    addElement(candidate);
  }

  for (const element of document.body?.querySelectorAll(PRIMARY_CONTROL_SELECTOR) ?? []) {
    addElement(element);
  }

  return elements;
}

function isDefinitelyIgnoredDomTag(element: HTMLElement): boolean {
  return ["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "TEMPLATE"].includes(element.tagName);
}

interface CleanDomBuildState {
  count: number;
  deadlineAt: number;
  targetElements: Map<string, HTMLElement>;
  capturedElements: WeakSet<HTMLElement>;
}

function collectCleanDomTree(
  root: HTMLElement,
  targetElements: Map<string, HTMLElement>,
  candidates: HTMLElement[] = []
): DomElementSnapshot[] {
  const state: CleanDomBuildState = {
    count: 0,
    deadlineAt: performance.now() + DOM_TREE_BUILD_BUDGET_MS,
    targetElements,
    capturedElements: new WeakSet()
  };
  const elements = collectCleanDomChildren(root, state, 0, false);
  const remainingRootSlots = Math.max(0, DOM_TREE_MAX_ROOT_ELEMENTS - elements.length);
  if (!isCleanDomBudgetExpired(state)) {
    elements.push(...collectSupplementalCleanDomTargets(root, state, false, remainingRootSlots));
  }
  const remainingMandatorySlots = Math.max(0, DOM_TREE_MAX_ROOT_ELEMENTS - elements.length);
  if (remainingMandatorySlots > 0) {
    elements.push(...collectMandatoryInteractiveCleanDomTargets(candidates, state, remainingMandatorySlots));
  }
  return elements;
}

function collectCleanDomChildren(
  parent: HTMLElement,
  state: CleanDomBuildState,
  depth: number,
  inheritedHidden: boolean
): DomElementSnapshot[] {
  if (state.count >= DOM_TREE_MAX_NODES || isCleanDomBudgetExpired(state)) {
    return [];
  }

  if (depth > DOM_TREE_MAX_DEPTH) {
    return collectPriorityCleanDomDescendants(parent, state, inheritedHidden);
  }

  const children: DomElementSnapshot[] = [];
  for (const child of getDomChildElements(parent)) {
    if (isCleanDomBudgetExpired(state)) {
      break;
    }

    const node = buildCleanDomNode(child, state, depth, inheritedHidden);
    if (node) {
      children.push(node);
    }

    if (children.length >= DOM_TREE_MAX_CHILDREN || state.count >= DOM_TREE_MAX_NODES) {
      break;
    }
  }

  return children;
}

function collectPriorityCleanDomDescendants(
  parent: HTMLElement,
  state: CleanDomBuildState,
  inheritedHidden: boolean
): DomElementSnapshot[] {
  const children: DomElementSnapshot[] = [];
  const selectedElements: HTMLElement[] = [];

  for (const descendant of iterateHtmlDescendants(parent, DOM_CAPTURE_CANDIDATE_LIMIT)) {
    if (
      children.length >= DOM_TREE_MAX_DEPTH_PRIORITY_DESCENDANTS ||
      state.count >= DOM_TREE_MAX_NODES ||
      isCleanDomBudgetExpired(state)
    ) {
      break;
    }

    if (selectedElements.some((selectedElement) => elementContainsDeep(selectedElement, descendant))) {
      continue;
    }

    if (!isPriorityCleanDomDescendant(descendant)) {
      continue;
    }

    const node = buildCleanDomNode(descendant, state, DOM_TREE_MAX_DEPTH, inheritedHidden);
    if (!node) {
      continue;
    }

    selectedElements.push(descendant);
    children.push(node);
  }

  return children;
}

function collectSupplementalCleanDomTargets(
  root: HTMLElement,
  state: CleanDomBuildState,
  inheritedHidden: boolean,
  maxTargets: number
): DomElementSnapshot[] {
  const targets: DomElementSnapshot[] = [];
  const targetLimit = Math.min(DOM_TREE_SUPPLEMENTAL_TARGET_LIMIT, maxTargets);

  for (const descendant of iterateHtmlDescendants(root, DOM_CAPTURE_CANDIDATE_LIMIT)) {
    if (targets.length >= targetLimit || state.count >= DOM_TREE_MAX_NODES || isCleanDomBudgetExpired(state)) {
      break;
    }

    if (state.capturedElements.has(descendant) || !isPriorityCleanDomDescendant(descendant)) {
      continue;
    }

    const node = buildCleanDomNode(descendant, state, DOM_TREE_MAX_DEPTH, inheritedHidden);
    if (node) {
      targets.push(node);
    }
  }

  return targets;
}

function collectMandatoryInteractiveCleanDomTargets(
  candidates: HTMLElement[],
  state: CleanDomBuildState,
  maxTargets: number
): DomElementSnapshot[] {
  const targets: DomElementSnapshot[] = [];
  const originalDeadline = state.deadlineAt;
  state.deadlineAt = Math.max(state.deadlineAt, performance.now() + 160);

  for (const candidate of collectLivePrimaryInteractiveDomElements(candidates)) {
    if (targets.length >= maxTargets || state.count >= DOM_TREE_MAX_NODES) {
      break;
    }

    if (
      state.capturedElements.has(candidate) ||
      !isMandatoryInteractiveDomElement(candidate) ||
      !isRenderedMandatoryInteractiveElement(candidate)
    ) {
      continue;
    }

    const node = buildCleanDomNode(candidate, state, DOM_TREE_MAX_DEPTH, false);
    if (node) {
      targets.push(node);
    }
  }

  state.deadlineAt = Math.max(originalDeadline, state.deadlineAt);
  return targets;
}

function* iterateHtmlDescendants(root: HTMLElement, maxElements: number): Generator<HTMLElement> {
  yield* iterateComposedHtmlDescendants(root, maxElements, isDefinitelyIgnoredDomTag);
}

function isPriorityCleanDomDescendant(element: HTMLElement): boolean {
  if (isBarkanWidgetElement(element) || isElementEffectivelyHiddenForCleanDom(element)) {
    return false;
  }

  const rect = getElementViewportRect(element);
  const visibility = getCleanDomVisibility(rect);
  if (visibility !== "visible" && visibility !== "partially_visible") {
    return false;
  }

  return isPrimaryInteractiveDomElement(element) || isVisibleHeadingElement(element);
}

function isMandatoryInteractiveDomElement(element: HTMLElement): boolean {
  if (isBarkanWidgetElement(element)) {
    return false;
  }

  return isPrimaryInteractiveDomElement(element);
}

function isRenderedMandatoryInteractiveElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.opacity === "0" ||
    element.hidden ||
    element.getAttribute("aria-hidden") === "true" ||
    element.inert
  ) {
    return false;
  }

  const rect = getElementViewportRect(element);
  return rect.width >= 1 && rect.height >= 1 && rect.right >= 0 && rect.left <= window.innerWidth;
}

function buildCleanDomNode(
  element: HTMLElement,
  state: CleanDomBuildState,
  depth: number,
  inheritedHidden: boolean
): DomElementSnapshot | null {
  if (state.count >= DOM_TREE_MAX_NODES || isCleanDomBudgetExpired(state)) {
    return null;
  }

  const style = window.getComputedStyle(element);
  if (shouldSkipCleanDomElement(element, style)) {
    return null;
  }

  const hidden = inheritedHidden || isElementHiddenForCleanDom(element, style);
  if (hidden) {
    return null;
  }

  const children = collectCleanDomChildren(element, state, depth + 1, hidden);
  const rect = getElementViewportRect(element);
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role") || undefined;
  const label = buildElementLabel(element);
  const text = buildCleanDomText(element, tag, label);
  const attributes = buildCleanDomAttributes(element);
  const interactive = isInteractiveDomElement(element);
  const visibility = getCleanDomVisibility(rect);
  const hasOwnMeaning = isMeaningfulCleanDomElement(element, {
    label,
    text,
    attributes,
    interactive,
    tag,
    role
  });

  if (!hasOwnMeaning && children.length === 0) {
    return null;
  }

  const id = `c${state.count + 1}`;
  state.count++;
  state.targetElements.set(id, element);
  state.capturedElements.add(element);

  return {
    id,
    tag,
    ...(role ? { role } : {}),
    ...(label ? { label } : {}),
    ...(text ? { text } : {}),
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    state: buildCleanDomState(element, hidden, inheritedHidden),
    rect: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    visibility,
    interactive,
    ...(children.length > 0 ? { children } : {})
  };
}

function isCleanDomBudgetExpired(state: CleanDomBuildState): boolean {
  return performance.now() > state.deadlineAt;
}

function shouldSkipCleanDomElement(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (isBarkanWidgetElement(element)) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  if (
    [
      "script",
      "style",
      "meta",
      "link",
      "noscript",
      "template",
      "path",
      "circle",
      "line",
      "polyline",
      "polygon",
      "defs",
      "clipPath"
    ].includes(tagName)
  ) {
    return true;
  }

  if (style.display === "none") {
    return !shouldKeepDisplayNoneCleanDomElement(element);
  }

  if (style.visibility === "hidden" || style.opacity === "0" || element.hidden || element.getAttribute("aria-hidden") === "true" || element.inert) {
    return !hasHiddenDomMeaning(element, 0) && !shouldKeepHiddenCleanDomElement(element, style);
  }

  return false;
}

function shouldKeepDisplayNoneCleanDomElement(element: HTMLElement): boolean {
  if (isBarkanWidgetElement(element)) {
    return false;
  }

  return hasHiddenDomMeaning(element, 0);
}

function isElementHiddenForCleanDom(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.opacity === "0" ||
    style.contentVisibility === "hidden" ||
    element.hidden ||
    element.getAttribute("aria-hidden") === "true" ||
    element.inert
  );
}

function isElementEffectivelyHiddenForCleanDom(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (isElementHiddenForCleanDom(current, style)) {
      return true;
    }

    current = getComposedParentElement(current);
  }

  return false;
}

function isElementRenderedForCleanDom(element: HTMLElement): boolean {
  return !isBarkanWidgetElement(element) && !isElementEffectivelyHiddenForCleanDom(element);
}

function isElementRenderedInViewportForCleanDom(element: HTMLElement): boolean {
  if (!isElementRenderedForCleanDom(element)) {
    return false;
  }

  const rect = getElementViewportRect(element);
  const visibility = getCleanDomVisibility(rect);
  return visibility === "visible" || visibility === "partially_visible";
}

function hasHiddenDomMeaning(element: HTMLElement, depth: number): boolean {
  if (depth > 7) {
    return false;
  }

  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const semanticText = [
    tag,
    role,
    element.id,
    element.className,
    element.getAttribute("name"),
    element.getAttribute("type"),
    element.getAttribute("placeholder"),
    element.getAttribute("title"),
    element.getAttribute("alt"),
    element.getAttribute("aria-label"),
    element.getAttribute("aria-controls"),
    element.getAttribute("aria-haspopup"),
    element.getAttribute("data-action"),
    element.getAttribute("data-role"),
    element.getAttribute("data-state"),
    element.getAttribute("data-slot"),
    getDirectText(element),
    getElementVisibleText(element, 240)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    ["button", "a", "input", "select", "textarea", "summary", "option", "dialog"].includes(tag) ||
    /button|link|menuitem|tab|checkbox|radio|switch|option|textbox|combobox|searchbox|dialog|alertdialog|menu/.test(role) ||
    element.hasAttribute("onclick") ||
    element.tabIndex >= 0 ||
    /\b(menu|modal|dialog|popover|dropdown|panel|drawer|sheet|tooltip|options?|settings?|preferences?|edit|modify|action|actions?|move|reorder|sort|position|left|right|up|down|previous|next|delete|remove|share|help|save|submit|cancel|close)\b/.test(semanticText)
  ) {
    return true;
  }

  return getDomChildElements(element)
    .slice(0, 40)
    .some((child) => isHtmlElement(child) && hasHiddenDomMeaning(child, depth + 1));
}

function shouldKeepHiddenCleanDomElement(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (isBarkanWidgetElement(element)) {
    return false;
  }

  const rect = getElementViewportRect(element);
  if (rect.width < 1 || rect.height < 1) {
    return false;
  }

  if (element.hasAttribute("onclick") || Boolean(element.onclick) || style.cursor === "pointer" || element.tabIndex >= 0) {
    return true;
  }

  const semanticText = [
    element.id,
    element.className,
    element.getAttribute("src"),
    element.getAttribute("alt"),
    element.getAttribute("title"),
    element.getAttribute("aria-label"),
    element.getAttribute("data-action"),
    element.getAttribute("data-role")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(edit|settings?|share|help|delete|remove|add|create|plus|close|back|next|previous|menu|more|options?)\b|\/(?:edit|settings?|share|help|delete|add|plus|menu|more)[^/]*\.svg\b/.test(
    semanticText
  );
}

function buildCleanDomText(element: HTMLElement, tag: string, label: string): string {
  if (["input", "select", "textarea", "img", "svg"].includes(tag)) {
    return "";
  }

  const directText = getDirectText(element);
  if (directText && directText !== label) {
    return directText;
  }

  if (["p", "li", "dt", "dd", "figcaption", "small", "strong", "em", "span", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    if (hasChildControlsForCleanDomText(element) && !isVisibleHeadingElement(element)) {
      return "";
    }

    const visibleText = getElementVisibleText(element, 260);
    return visibleText === label ? "" : visibleText;
  }

  return "";
}

function hasChildControlsForCleanDomText(element: HTMLElement): boolean {
  const controlSelector = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='tab']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']"
  ].join(",");

  return getDomChildElements(element).some(
    (child) => isHtmlElement(child) && (isPrimaryInteractiveDomElement(child) || child.querySelector(controlSelector))
  );
}

function buildCleanDomAttributes(element: HTMLElement): Record<string, string> {
  const attributes: Record<string, string> = {};
  const setAttribute = (name: string, value: string | null | undefined, maxLength = 180) => {
    const sanitized = sanitizeMetadataValue(value ?? "", maxLength);
    if (sanitized) {
      attributes[name] = sanitized;
    }
  };

  setAttribute("id", element.id, 80);
  const classTokens = getSafeClassTokens(element);
  if (classTokens.length > 0) {
    attributes.class = classTokens.join(" ");
  }

  for (const name of ["name", "type", "placeholder", "title", "alt", "aria-label", "aria-current", "aria-expanded", "aria-controls", "aria-haspopup"]) {
    setAttribute(name, element.getAttribute(name), 160);
  }

  if (element.hasAttribute("draggable")) {
    setAttribute("draggable", element.getAttribute("draggable"), 16);
  }

  if (element.hasAttribute("aria-grabbed")) {
    setAttribute("aria-grabbed", element.getAttribute("aria-grabbed"), 16);
  }

  if (element.hasAttribute("dropzone")) {
    setAttribute("dropzone", element.getAttribute("dropzone"), 80);
  }

  if (isHtmlAnchorElement(element)) {
    setAttribute("href", sanitizeHref(element), 240);
  }

  if (isHtmlImageElement(element)) {
    setAttribute("src", sanitizeAssetReference(element.getAttribute("src")), 240);
  }

  if (isHtmlImageElement(element) || isSvgElement(element)) {
    setAttribute("icon", inferElementIconName(element as unknown as HTMLElement), 80);
  }

  const testId = getTestIdMetadata(element);
  if (testId) {
    attributes.testid = testId;
  }

  const data = getSafeDataAttributes(element);
  for (const [key, value] of Object.entries(data)) {
    setAttribute(`data-${key}`, value, 120);
  }

  return attributes;
}

function sanitizeAssetReference(value: string | null): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value, window.location.href);
    return `${url.pathname}${url.hash ? url.hash : ""}`.slice(0, 240);
  } catch {
    return value.slice(0, 240);
  }
}

function buildCleanDomState(
  element: HTMLElement,
  hidden: boolean,
  ancestorHidden: boolean
): NonNullable<DomElementSnapshot["state"]> {
  const style = window.getComputedStyle(element);
  return {
    ...(isDisabledFormControl(element) || element.getAttribute("aria-disabled") === "true" ? { disabled: true } : {}),
    ...(isSelectedControl(element) || element.getAttribute("aria-selected") === "true" ? { selected: true } : {}),
    ...(element.getAttribute("aria-expanded") ? { expanded: element.getAttribute("aria-expanded") === "true" } : {}),
    ...(element.getAttribute("aria-checked") ? { checked: normalizeAriaChecked(element.getAttribute("aria-checked")) } : {}),
    ...(isRequiredFormControl(element) || element.getAttribute("aria-required") === "true" ? { required: true } : {}),
    ...(document.activeElement === element ? { focused: true } : {}),
    ...(hidden || isElementHiddenForCleanDom(element, style) ? { hidden: true } : {}),
    ...(ancestorHidden ? { ancestorHidden: true } : {})
  };
}

function normalizeAriaChecked(value: string | null): boolean | "mixed" {
  if (value === "mixed") {
    return "mixed";
  }

  return value === "true";
}

function getCleanDomVisibility(rect: DOMRect): DomElementVisibility {
  if (rect.width < 1 || rect.height < 1 || rect.right < 0 || rect.left > window.innerWidth) {
    return "outside";
  }

  return getViewportVisibility(rect);
}

function isMeaningfulCleanDomElement(
  element: HTMLElement,
  summary: {
    label: string;
    text: string;
    attributes: Record<string, string>;
    interactive: boolean;
    tag: string;
    role?: string;
  }
): boolean {
  if (summary.interactive || summary.label || summary.text || Object.keys(summary.attributes).length > 0) {
    return true;
  }

  if (/button|link|menuitem|tab|checkbox|radio|switch|option|textbox|combobox|searchbox|dialog|alertdialog|navigation|main|banner|contentinfo/.test(summary.role ?? "")) {
    return true;
  }

  return [
    "main",
    "nav",
    "header",
    "footer",
    "aside",
    "section",
    "article",
    "form",
    "dialog",
    "button",
    "a",
    "label",
    "img",
    "svg",
    "input",
    "select",
    "textarea",
    "summary",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td"
  ].includes(summary.tag) || /^h[1-6]$/.test(summary.tag);
}

function isInteractiveDomElement(element: HTMLElement): boolean {
  if (isPrimaryInteractiveDomElement(element)) {
    return true;
  }

  return window.getComputedStyle(element).cursor === "pointer";
}

function isPrimaryInteractiveDomElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  return (
    ["button", "a", "input", "select", "textarea", "summary", "option"].includes(tag) ||
    /button|link|menuitem|tab|checkbox|radio|switch|option|textbox|combobox|searchbox|slider|spinbutton/.test(role) ||
    element.hasAttribute("onclick") ||
    Boolean(element.onclick) ||
    element.tabIndex >= 0
  );
}

function isVisibleHeadingElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  return /^h[1-6]$/.test(tag) || role === "heading";
}

interface FactElementPair {
  fact: UiFact;
  element: HTMLElement;
}

interface DomFactCandidate {
  element: HTMLElement;
  baseElement: Omit<UiFact, "id">;
  activeSurface: ActiveSurfaceDraft | null;
  order: number;
  score: number;
}

interface DomUiFactCollection {
  uiFacts: UiFact[];
  offscreenUiFacts: UiFact[];
  pairs: FactElementPair[];
  elementToFactId: WeakMap<HTMLElement, string>;
}

function collectDomUiFacts(
  candidates: HTMLElement[],
  userPrompt: string,
  scrollSurfaceMap: Map<Element, string>,
  activeSurfaceDrafts: ActiveSurfaceDraft[],
  targetElements: Map<string, HTMLElement>
): DomUiFactCollection {
  const contextCache = new Map<HTMLElement, string>();
  const visibleCandidates: DomFactCandidate[] = [];
  const offscreenCandidates: DomFactCandidate[] = [];
  const seenPointableElements = new WeakSet<HTMLElement>();
  let order = 0;

  for (const element of candidates) {
    if (isBarkanWidgetElement(element) || !isUsefulDomCandidate(element)) {
      continue;
    }

    if (shouldSuppressNestedUiFact(element)) {
      continue;
    }

    const rect = getElementViewportRect(element);
    const visibility = getViewportVisibility(rect);
    const isVisible = visibility === "visible" || visibility === "partially_visible";
    if (!isVisible && visibility !== "above" && visibility !== "below") {
      continue;
    }

    const baseElement = buildUiFactBaseElement(element, rect, isVisible, scrollSurfaceMap, activeSurfaceDrafts, contextCache);
    if (!baseElement) {
      continue;
    }

    const activeSurface = findContainingActiveSurface(element, activeSurfaceDrafts);
    const score = isVisible
      ? scoreVisibleCandidateForPrompt(baseElement, userPrompt, rect, visibility)
      : scoreCandidateForPrompt(baseElement, userPrompt);
    const candidate: DomFactCandidate = {
      element,
      baseElement,
      activeSurface,
      order,
      score
    };
    order++;

    if (isVisible) {
      visibleCandidates.push(candidate);
    } else if (score > 0 || isActionableUiFact(baseElement) || baseElement.kind === "heading") {
      offscreenCandidates.push(candidate);
    }
  }

  const selectedVisibleCandidates = selectVisibleUiFacts(visibleCandidates);
  const selectedOffscreenCandidates = selectOffscreenUiFacts(offscreenCandidates);
  const elementToFactId = new WeakMap<HTMLElement, string>();
  const pairs: FactElementPair[] = [];
  let sequence = 0;

  const materializeFact = (candidate: DomFactCandidate): UiFact | null => {
    if (seenPointableElements.has(candidate.element)) {
      return null;
    }

    sequence++;
    const fact: UiFact = {
      id: `u${sequence}`,
      ...candidate.baseElement
    };
    seenPointableElements.add(candidate.element);
    targetElements.set(fact.id, candidate.element);
    elementToFactId.set(candidate.element, fact.id);
    pairs.push({ fact, element: candidate.element });
    rememberActiveSurfaceFact(candidate.activeSurface, fact.id, fact.label);
    return fact;
  };

  const uiFacts = selectedVisibleCandidates.map(materializeFact).filter((fact): fact is UiFact => Boolean(fact));
  const offscreenUiFacts = selectedOffscreenCandidates.map(materializeFact).filter((fact): fact is UiFact => Boolean(fact));

  const fallbackCandidates = collectPrimaryControlUiFactFallbackCandidates(
    candidates,
    userPrompt,
    scrollSurfaceMap,
    activeSurfaceDrafts,
    contextCache,
    seenPointableElements
  );
  for (const candidate of fallbackCandidates) {
    if (uiFacts.length >= VISIBLE_UI_FACT_LIMIT && offscreenUiFacts.length >= OFFSCREEN_UI_FACT_LIMIT) {
      break;
    }

    const candidateVisible = candidate.baseElement.state.visible;
    if (
      (candidateVisible && uiFacts.length >= VISIBLE_UI_FACT_LIMIT) ||
      (!candidateVisible && offscreenUiFacts.length >= OFFSCREEN_UI_FACT_LIMIT)
    ) {
      continue;
    }

    const fact = materializeFact(candidate);
    if (!fact) {
      continue;
    }

    if (candidateVisible) {
      uiFacts.push(fact);
    } else if (offscreenUiFacts.length < OFFSCREEN_UI_FACT_LIMIT) {
      offscreenUiFacts.push(fact);
    }
  }

  return {
    uiFacts,
    offscreenUiFacts,
    pairs,
    elementToFactId
  };
}

function collectPrimaryControlUiFactFallbackCandidates(
  candidates: HTMLElement[],
  userPrompt: string,
  scrollSurfaceMap: Map<Element, string>,
  activeSurfaceDrafts: ActiveSurfaceDraft[],
  contextCache: Map<HTMLElement, string>,
  seenPointableElements: WeakSet<HTMLElement>
): DomFactCandidate[] {
  const fallbackCandidates: DomFactCandidate[] = [];
  let order = 0;

  for (const element of collectLivePrimaryInteractiveDomElements(candidates)) {
    if (fallbackCandidates.length >= PRIMARY_CONTROL_UI_FACT_FALLBACK_LIMIT) {
      break;
    }

    if (
      seenPointableElements.has(element) ||
      !isMandatoryInteractiveDomElement(element) ||
      !isRenderedMandatoryInteractiveElement(element)
    ) {
      continue;
    }

    const rect = getElementViewportRect(element);
    const visibility = getViewportVisibility(rect);
    const isVisible = visibility === "visible" || visibility === "partially_visible";
    if (!isVisible && visibility !== "above" && visibility !== "below") {
      continue;
    }

    const baseElement = buildUiFactBaseElement(element, rect, isVisible, scrollSurfaceMap, activeSurfaceDrafts, contextCache);
    if (!baseElement || !hasPrimaryControlUiFactIdentity(baseElement)) {
      continue;
    }

    const activeSurface = findContainingActiveSurface(element, activeSurfaceDrafts);
    const score = isVisible
      ? scoreVisibleCandidateForPrompt(baseElement, userPrompt, rect, visibility)
      : scoreCandidateForPrompt(baseElement, userPrompt);

    fallbackCandidates.push({
      element,
      baseElement,
      activeSurface,
      order,
      score
    });
    order++;
  }

  return fallbackCandidates.sort((left, right) => {
    const leftVisible = left.baseElement.state.visible ? 1 : 0;
    const rightVisible = right.baseElement.state.visible ? 1 : 0;
    if (rightVisible !== leftVisible) {
      return rightVisible - leftVisible;
    }

    return left.order - right.order;
  });
}

function hasPrimaryControlUiFactIdentity(element: Omit<UiFact, "id">): boolean {
  return Boolean(element.label || element.text || element.href || element.metadata?.domId || element.metadata?.testId);
}

function buildUiFactBaseElement(
  element: HTMLElement,
  rect: DOMRect,
  visible: boolean,
  scrollSurfaceMap: Map<Element, string>,
  activeSurfaceDrafts: ActiveSurfaceDraft[],
  contextCache: Map<HTMLElement, string>
): Omit<UiFact, "id"> | null {
  const kind = getUiFactKind(element);
  const label = buildElementLabel(element) || getElementVisibleText(element, 180) || inferElementIconLabel(element);
  const text = getElementVisibleText(element, kind === "text" || kind === "table" ? 320 : 180);
  const metadata = buildElementMetadata(element);
  if (!label && !text && !metadata && !isActionableUiFact({ kind }) && kind !== "heading") {
    return null;
  }

  const activeSurface = findContainingActiveSurface(element, activeSurfaceDrafts);
  const surfaceId = activeSurface?.surface.id ?? findContainingScrollSurfaceId(element, scrollSurfaceMap);
  const context = buildElementContext(element, contextCache);
  const href = sanitizeHref(element);

  return {
    kind,
    ...(element.getAttribute("role") ? { role: element.getAttribute("role") ?? undefined } : {}),
    label: cleanDomText(label || text || getFallbackElementLabel(element, kind)).slice(0, 180),
    ...(text && text !== label ? { text: text.slice(0, 260) } : {}),
    ...(href ? { href } : {}),
    ...(context ? { context } : {}),
    ...(metadata ? { metadata } : {}),
    state: getUiFactState(element, visible),
    rect: rectToSnapshotRect(rect),
    ...(surfaceId
      ? {
          surface: {
            id: surfaceId,
            relation: activeSurface?.element === element ? "self" : "descendant"
          }
        }
      : {})
  };
}

function getFallbackElementLabel(element: HTMLElement, kind: UiFactKind): string {
  const metadata = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("name"),
    element.getAttribute("placeholder"),
    getElementTypeMetadata(element)
  ]
    .filter(Boolean)
    .join(" ");
  return cleanDomText(metadata || kind);
}

function shouldSuppressNestedUiFact(element: HTMLElement): boolean {
  if (isPrimaryInteractiveDomElement(element)) {
    return false;
  }

  return isNestedInsidePointableAncestor(element);
}

function selectVisibleUiFacts(candidates: DomFactCandidate[]): DomFactCandidate[] {
  const mandatory = candidates
    .filter((candidate) => isMandatoryInteractiveDomElement(candidate.element))
    .sort((left, right) => left.order - right.order);
  const mandatoryElements = new WeakSet(mandatory.map((candidate) => candidate.element));
  const remaining = candidates
    .filter((candidate) => !mandatoryElements.has(candidate.element))
    .sort(compareDomFactCandidates);
  return [...mandatory, ...remaining].slice(0, VISIBLE_UI_FACT_LIMIT);
}

function selectOffscreenUiFacts(candidates: DomFactCandidate[]): DomFactCandidate[] {
  return [...candidates]
    .sort((left, right) => compareDomFactCandidates(left, right) || Math.abs(left.baseElement.rect.y) - Math.abs(right.baseElement.rect.y))
    .slice(0, OFFSCREEN_UI_FACT_LIMIT);
}

function compareDomFactCandidates(left: DomFactCandidate, right: DomFactCandidate): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const leftActionable = isActionableUiFact(left.baseElement) ? 1 : 0;
  const rightActionable = isActionableUiFact(right.baseElement) ? 1 : 0;
  if (rightActionable !== leftActionable) {
    return rightActionable - leftActionable;
  }

  return left.order - right.order;
}

function collectDomRelationships(
  candidates: HTMLElement[],
  pairs: FactElementPair[],
  elementToFactId: WeakMap<HTMLElement, string>
): DomRelationship[] {
  const relationships: DomRelationship[] = [];
  const seen = new Set<string>();
  const factIdByDomId = new Map<string, string>();
  for (const candidate of candidates) {
    if (!candidate.id) {
      continue;
    }

    const factId = elementToFactId.get(candidate);
    if (factId) {
      factIdByDomId.set(candidate.id, factId);
    }
  }

  const addRelationship = (relationship: DomRelationship) => {
    const key = `${relationship.kind}:${relationship.from}:${relationship.to}`;
    if (seen.has(key) || relationships.length >= 160) {
      return;
    }
    seen.add(key);
    relationships.push(relationship);
  };

  for (const { fact, element } of pairs) {
    const describedBy = resolveFactIdsFromIdList(element.getAttribute("aria-describedby"), factIdByDomId);
    for (const targetId of describedBy) {
      addRelationship({ kind: "described_by", from: fact.id, to: targetId });
    }

    const controls = resolveFactIdsFromIdList(element.getAttribute("aria-controls"), factIdByDomId);
    for (const targetId of controls) {
      addRelationship({ kind: "controls", from: fact.id, to: targetId });
    }

    const owns = resolveFactIdsFromIdList(element.getAttribute("aria-owns"), factIdByDomId);
    for (const targetId of owns) {
      addRelationship({ kind: "owns", from: fact.id, to: targetId });
    }
  }

  for (const label of candidates.filter(isExplicitFormLabel)) {
    if (isBarkanWidgetElement(label)) {
      continue;
    }

    const labelId = elementToFactId.get(label);
    const target = findElementByIdInAccessibleScope(label, label.htmlFor);
    if (!labelId || !target) {
      continue;
    }

    const targetId = elementToFactId.get(target);
    if (targetId) {
      addRelationship({ kind: "label_for", from: labelId, to: targetId, label: cleanDomText(label.textContent || "").slice(0, 120) });
    }
  }

  const forms = candidates.filter(isHtmlFormElement);
  for (const [formIndex, form] of forms.entries()) {
    if (isBarkanWidgetElement(form)) {
      continue;
    }

    const formId = getStableFormId(form, formIndex + 1);
    for (const control of Array.from(form.elements)) {
      if (!isHtmlElement(control)) {
        continue;
      }

      const factId = elementToFactId.get(control);
      if (!factId) {
        continue;
      }

      const kind = isSubmitControl(control) ? "form_submit" : "form_field";
      addRelationship({ kind, from: formId, to: factId });
    }
  }

  return relationships;
}

function resolveFactIdsFromIdList(idList: string | null, factIdByDomId: Map<string, string>): string[] {
  if (!idList) {
    return [];
  }

  const factIds: string[] = [];
  for (const id of idList.split(/\s+/)) {
    const factId = factIdByDomId.get(id);
    if (factId) {
      factIds.push(factId);
    }
  }

  return factIds;
}

function isExplicitFormLabel(element: HTMLElement): element is HTMLLabelElement {
  return element.tagName.toLowerCase() === "label" && Boolean((element as HTMLLabelElement).htmlFor);
}

function collectFormSummaries(candidates: HTMLElement[], elementToFactId: WeakMap<HTMLElement, string>): FormSummary[] {
  const forms: FormSummary[] = [];
  const formElements = candidates.filter(isHtmlFormElement);
  for (const [formIndex, form] of formElements.entries()) {
    if (forms.length >= 12 || isBarkanWidgetElement(form)) {
      continue;
    }

    const rect = getElementViewportRect(form);
    if (rect.width < 8 || rect.height < 8) {
      continue;
    }

    const fieldIds: string[] = [];
    const submitIds: string[] = [];
    for (const control of Array.from(form.elements)) {
      if (!isHtmlElement(control)) {
        continue;
      }

      const factId = elementToFactId.get(control);
      if (!factId) {
        continue;
      }

      if (isSubmitControl(control)) {
        if (submitIds.length < 20) {
          submitIds.push(factId);
        }
      } else if (fieldIds.length < 80) {
        fieldIds.push(factId);
      }
    }

    if (fieldIds.length === 0 && submitIds.length === 0) {
      continue;
    }

    forms.push({
      id: getStableFormId(form, formIndex + 1),
      label: buildFormLabel(form) || "form",
      rect: rectToSnapshotRect(rect),
      fieldIds,
      submitIds,
      validationMessages: collectValidationMessages(form)
    });
  }

  if (forms.length > 0) {
    return forms;
  }

  return collectImplicitFormSummaries(candidates, elementToFactId);
}

function collectImplicitFormSummaries(candidates: HTMLElement[], elementToFactId: WeakMap<HTMLElement, string>): FormSummary[] {
  const controlFacts = candidates
    .filter((element) => elementToFactId.has(element))
    .filter((element) => isFormControlLike(element));
  if (controlFacts.length === 0) {
    return [];
  }

  const groups = new Map<HTMLElement, HTMLElement[]>();
  for (const control of controlFacts) {
    const group = findImplicitFormContainer(control);
    if (!group) {
      continue;
    }
    groups.set(group, [...(groups.get(group) ?? []), control]);
  }

  const summaries: FormSummary[] = [];
  let sequence = 0;
  for (const [container, controls] of groups.entries()) {
    if (summaries.length >= 12) {
      break;
    }

    const rect = getElementViewportRect(container);
    if (rect.width < 8 || rect.height < 8 || controls.length < 2) {
      continue;
    }

    sequence++;
    const fieldIds: string[] = [];
    const submitIds: string[] = [];
    for (const control of controls) {
      const factId = elementToFactId.get(control);
      if (!factId) {
        continue;
      }

      if (isSubmitControl(control)) {
        submitIds.push(factId);
      } else {
        fieldIds.push(factId);
      }
    }

    summaries.push({
      id: `form_implicit_${sequence}`,
      label: buildFormLabel(container) || "form group",
      rect: rectToSnapshotRect(rect),
      fieldIds: fieldIds.slice(0, 80),
      submitIds: submitIds.slice(0, 20),
      validationMessages: collectValidationMessages(container)
    });
  }

  return summaries;
}

function findImplicitFormContainer(control: HTMLElement): HTMLElement | null {
  let current = getComposedParentElement(control);
  let depth = 0;
  while (current && current !== document.body && depth < 5) {
    const controlCount = countDescendantFormControls(current);
    if (controlCount >= 2) {
      return current;
    }
    current = getComposedParentElement(current);
    depth++;
  }
  return null;
}

function countDescendantFormControls(root: HTMLElement): number {
  let count = 0;
  for (const candidate of iterateHtmlDescendants(root, 80)) {
    if (candidate === root || isBarkanWidgetElement(candidate)) {
      continue;
    }

    if (isFormControlLike(candidate)) {
      count++;
      if (count >= 4) {
        break;
      }
    }
  }
  return count;
}

function buildFormLabel(element: HTMLElement): string {
  return cleanDomText(
    element.getAttribute("aria-label") ||
      getElementTextById(element, element.getAttribute("aria-labelledby")) ||
      findFirstHeadingText(element) ||
      element.getAttribute("name") ||
      ""
  ).slice(0, 180);
}

function getStableFormId(form: HTMLFormElement, fallbackIndex = 1): string {
  const safeDomId = sanitizeMetadataValue(form.id, 40);
  if (safeDomId && isSafeIdentifierValue(safeDomId)) {
    return `form_${safeDomId}`;
  }

  return `form_${Math.max(1, fallbackIndex)}`;
}

function collectValidationMessages(root: HTMLElement): string[] {
  return uniqueCleanLabels(
    Array.from(iterateHtmlDescendants(root, 160))
      .filter((element) =>
        element.matches("[role='alert'],[aria-live],[data-error],[data-validation],.error,.field-error,.form-error")
      )
      .filter((element) => !isBarkanWidgetElement(element))
      .map((element) => cleanDomText(element.textContent || "").slice(0, 180)),
    8
  );
}

function isSubmitControl(element: HTMLElement): boolean {
  return (
    isHtmlButtonElement(element) ||
    (isHtmlInputElement(element) && ["submit", "button", "reset"].includes(element.type.toLowerCase())) ||
    element.getAttribute("role")?.toLowerCase() === "button"
  );
}

function isFormControlLike(element: HTMLElement): boolean {
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  return (
    isHtmlInputElement(element) ||
    isHtmlSelectElement(element) ||
    isHtmlTextAreaElement(element) ||
    isHtmlButtonElement(element) ||
    /textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton|button/.test(role)
  );
}

function collectContentBlocks(
  candidates: HTMLElement[],
  pairs: FactElementPair[],
  userPrompt: string
): ContentBlock[] {
  const blocks: Array<ContentBlock & { score: number; area: number }> = [];
  const seenText = new Set<string>();
  const pairRects = pairs.map((pair) => ({
    fact: pair.fact,
    rect: getElementViewportRect(pair.element)
  }));

  for (const element of candidates) {
    if (blocks.length >= 60 || isBarkanWidgetElement(element) || !isContentBlockCandidate(element)) {
      continue;
    }

    const rect = getElementViewportRect(element);
    const visibility = getViewportVisibility(rect);
    if ((visibility !== "visible" && visibility !== "partially_visible") || rect.width < 40 || rect.height < 16) {
      continue;
    }

    const text = getContentBlockText(element);
    if (text.length < 30) {
      continue;
    }

    const textKey = normalizeSearchText(text.slice(0, 180));
    if (!textKey || seenText.has(textKey)) {
      continue;
    }
    seenText.add(textKey);

    const nearbyFactIds = pairRects
      .filter(({ rect: factRect }) => isRectNearContainer(factRect, rect))
      .map(({ fact }) => fact.id)
      .slice(0, 20);
    const heading = findNearestHeadingText(element) || findFirstHeadingText(element) || undefined;
    const score = scoreContentBlock(element, text, heading, nearbyFactIds, userPrompt);
    if (score <= 0) {
      continue;
    }

    blocks.push({
      id: `block_${blocks.length + 1}`,
      ...(heading ? { heading: heading.slice(0, 180) } : {}),
      text: text.slice(0, 700),
      rect: rectToSnapshotRect(rect),
      nearbyFactIds,
      score,
      area: rect.width * rect.height
    });
  }

  return blocks
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.rect.y - right.rect.y || left.area - right.area;
    })
    .slice(0, 20)
    .map(({ score, area, ...block }) => block);
}

function isContentBlockCandidate(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  if (["button", "a", "input", "select", "textarea", "script", "style", "svg", "path"].includes(tagName)) {
    return false;
  }

  if (/button|link|textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton/.test(role)) {
    return false;
  }

  return (
    ["main", "section", "article", "aside", "li", "p", "td", "th", "blockquote", "figcaption"].includes(tagName) ||
    /region|article|cell|row|listitem|status|note/.test(role) ||
    element.hasAttribute("data-description") ||
    element.hasAttribute("data-summary")
  );
}

function getContentBlockText(element: HTMLElement): string {
  const rawText =
    element.getAttribute("data-description") ||
    element.getAttribute("data-summary") ||
    element.textContent ||
    "";
  return cleanDomText(rawText).slice(0, 900);
}

function scoreContentBlock(
  element: HTMLElement,
  text: string,
  heading: string | undefined,
  nearbyFactIds: string[],
  userPrompt: string
): number {
  const searchableText = [text, heading, element.getAttribute("aria-label"), element.getAttribute("role")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const queryTokens = tokenizeForSearch(userPrompt);
  let score = nearbyFactIds.length > 0 ? 3 : 1;
  for (const token of queryTokens) {
    if (searchableText.includes(token)) {
      score += 4;
    }
  }

  const tagName = element.tagName.toLowerCase();
  if (["article", "section", "main"].includes(tagName)) {
    score += 3;
  }
  if (heading) {
    score += 2;
  }
  if (text.length > 80) {
    score += 2;
  }

  return score;
}

function findNearestHeadingText(element: HTMLElement): string {
  let current = element.previousElementSibling;
  let hops = 0;
  while (isHtmlElement(current) && hops < 4) {
    if (/^h[1-6]$/i.test(current.tagName) || current.getAttribute("role")?.toLowerCase() === "heading") {
      return cleanDomText(current.textContent || "");
    }
    current = current.previousElementSibling;
    hops++;
  }
  return "";
}

function isRectNearContainer(childRect: DOMRect, containerRect: DOMRect): boolean {
  return (
    childRect.bottom >= containerRect.top - 8 &&
    childRect.top <= containerRect.bottom + 8 &&
    childRect.right >= containerRect.left - 8 &&
    childRect.left <= containerRect.right + 8
  );
}

function collectPageMeta(
  route: string,
  candidates: HTMLElement[],
  uiFacts: UiFact[],
  activeSurfaces: ActiveSurface[],
  elementToFactId: WeakMap<HTMLElement, string>
): PageMeta {
  const focusedElement = isHtmlElement(document.activeElement) ? document.activeElement : null;
  return {
    ...(document.title ? { title: cleanDomText(document.title).slice(0, 180) } : {}),
    route,
    headings: collectVisibleHeadingTexts(candidates),
    landmarks: collectLandmarkLabels(candidates),
    selectedNav: uniqueCleanLabels(
      uiFacts
        .filter((fact) => fact.state.selected || fact.metadata?.aria?.current)
        .map((fact) => fact.label),
      16
    ),
    ...(activeSurfaces.find((surface) => /dialog|alertdialog/i.test(surface.role ?? "") || surface.stacking.hasBackdrop)?.label
      ? { activeDialog: activeSurfaces.find((surface) => /dialog|alertdialog/i.test(surface.role ?? "") || surface.stacking.hasBackdrop)?.label }
      : {}),
    ...(focusedElement && elementToFactId.get(focusedElement) ? { focusedFactId: elementToFactId.get(focusedElement) } : {})
  };
}

function collectVisibleHeadingTexts(candidates: HTMLElement[]): string[] {
  return uniqueCleanLabels(
    candidates
      .filter((element) => element.matches("h1,h2,h3,h4,h5,h6,[role='heading']"))
      .filter(isElementRenderedInViewportForCleanDom)
      .map((element) => element.textContent || ""),
    24
  );
}

function collectLandmarkLabels(candidates: HTMLElement[]): string[] {
  return uniqueCleanLabels(
    candidates
      .filter((element) =>
        element.matches(
          "header,nav,main,footer,aside,form,[role='banner'],[role='navigation'],[role='main'],[role='contentinfo'],[role='complementary'],[role='search'],[role='form'],[role='region']"
        )
      )
      .filter(isElementRenderedForCleanDom)
      .map((element) => {
        const role = element.getAttribute("role") || element.tagName.toLowerCase();
        const label = buildSurfaceLabel(element);
        return cleanDomText(label ? `${role}: ${label}` : role);
      }),
    24
  );
}

function rectToSnapshotRect(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function deriveDomSnapshotMarkers(uiFacts: UiFact[], activeSurfaces: ActiveSurface[]): DomSnapshotMarkers {
  return {
    selectedLabels: uniqueCleanLabels(uiFacts.filter((fact) => fact.state.selected).map((fact) => fact.label), 16),
    visibleHeadings: uniqueCleanLabels(uiFacts.filter((fact) => fact.kind === "heading").map((fact) => fact.label), 16),
    primaryActions: uniqueCleanLabels(
      uiFacts
        .filter((fact) => ["button", "link", "input", "menu"].includes(fact.kind) && !fact.state.disabled)
        .sort((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x)
        .map((fact) => fact.label),
      20
    ),
    collectionHints: uniqueCleanLabels(
      uiFacts
        .filter((fact) => fact.kind === "table" || /\b(card|row|list|grid|table|collection|folder|file)\b/i.test(fact.context ?? ""))
        .flatMap((fact) => [fact.context, fact.label])
        .filter((label): label is string => Boolean(label)),
      16
    ),
    activeSurfaceLabels: uniqueCleanLabels(
      activeSurfaces.flatMap((surface) => [surface.label, ...surface.sampleLabels]).filter((label): label is string => Boolean(label)),
      16
    ),
    transientLabels: uniqueCleanLabels(
      [
        ...uiFacts.filter((fact) => fact.kind === "modal" || fact.kind === "menu").map((fact) => fact.label),
        ...activeSurfaces
          .filter((surface) => surface.stacking.hasBackdrop || surface.stacking.zIndex !== null || surface.stacking.containsFocus)
          .flatMap((surface) => [surface.label, ...surface.sampleLabels])
          .filter((label): label is string => Boolean(label))
      ],
      16
    )
  };
}

function uniqueCleanLabels(labels: string[], limit: number): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const cleaned = cleanDomText(label);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

interface ActiveSurfaceDraft {
  element: HTMLElement;
  surface: ActiveSurface;
  score: number;
  area: number;
}

function collectActiveSurfaceDrafts(candidates: HTMLElement[]): ActiveSurfaceDraft[] {
  const rawCandidates: Array<Omit<ActiveSurfaceDraft, "surface"> & { style: CSSStyleDeclaration }> = [];

  for (const element of candidates) {
    if (isBarkanWidgetElement(element)) {
      continue;
    }

    const style = window.getComputedStyle(element);
    const rect = getElementViewportRect(element);
    if (!isVisibleSurfaceRect(rect, style)) {
      continue;
    }

    const score = scoreActiveSurfaceCandidate(element, rect, style);
    if (score <= 0) {
      continue;
    }

    rawCandidates.push({
      element,
      score,
      area: rect.width * rect.height,
      style
    });
  }

  const selected = selectActiveSurfaceCandidates(rawCandidates);
  return selected.map((candidate, index) => {
    const rect = getElementViewportRect(candidate.element);
    const label = buildSurfaceLabel(candidate.element);
    return {
      element: candidate.element,
      score: candidate.score,
      area: candidate.area,
      surface: {
        id: `surface_${index + 1}`,
        ...(label ? { label } : {}),
        role: candidate.element.getAttribute("role") || undefined,
        tagName: candidate.element.tagName.toLowerCase(),
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        layout: describeSurfaceLayout(rect),
        stacking: describeSurfaceStacking(candidate.element, candidate.style),
        factIds: [],
        sampleLabels: []
      }
    };
  });
}

function isVisibleSurfaceRect(rect: DOMRect, style: CSSStyleDeclaration): boolean {
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    style.pointerEvents === "none"
  ) {
    return false;
  }

  if (rect.width < 48 || rect.height < 32) {
    return false;
  }

  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function scoreActiveSurfaceCandidate(element: HTMLElement, rect: DOMRect, style: CSSStyleDeclaration): number {
  if (["HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "SVG", "PATH"].includes(element.tagName)) {
    return 0;
  }

  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const tagName = element.tagName.toLowerCase();
  const areaRatio = getViewportAreaRatio(rect);
  const labelled = Boolean(
    element.getAttribute("aria-label") ||
      element.getAttribute("aria-labelledby") ||
      element.getAttribute("title")
  );
  const cssPosition = style.position.toLowerCase();
  const containsFocus = isElementOrDescendantFocused(element);
  let score = 0;

  if (isElementTopLayerLike(element, role)) {
    score += 14;
  }

  if (/dialog|alertdialog|menu|listbox|tooltip|tree|grid|tabpanel/.test(role)) {
    score += 8;
  }

  if (/navigation|main|banner|contentinfo|complementary|region|search|form/.test(role)) {
    score += 5;
  }

  if (["dialog", "aside", "nav", "header", "footer", "main", "form"].includes(tagName)) {
    score += 5;
  }

  if (cssPosition === "fixed" || cssPosition === "sticky") {
    score += 7;
  } else if (cssPosition === "absolute") {
    score += 3;
  }

  if (containsFocus) {
    score += 5;
  }

  if (labelled) {
    score += 3;
  }

  if (areaRatio > 0.92 && !isElementTopLayerLike(element, role)) {
    score -= 6;
  }

  if (score <= 0 && !containsFocus) {
    return 0;
  }

  const usefulChildCount = countUsefulSurfaceChildren(element);
  if (usefulChildCount >= 4) {
    score += 3;
  } else if (usefulChildCount >= 2) {
    score += 1;
  }

  if (areaRatio >= 0.03 && areaRatio <= 0.85) {
    score += 2;
  }

  return usefulChildCount > 0 || containsFocus || isElementTopLayerLike(element, role) ? score : 0;
}

function selectActiveSurfaceCandidates<T extends { element: HTMLElement; score: number; area: number; style: CSSStyleDeclaration }>(
  candidates: T[]
): T[] {
  const sortedCandidates = [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const rightZIndex = parseCssZIndex(right.style.zIndex) ?? 0;
    const leftZIndex = parseCssZIndex(left.style.zIndex) ?? 0;
    if (rightZIndex !== leftZIndex) {
      return rightZIndex - leftZIndex;
    }

    return left.area - right.area;
  });

  const selected: T[] = [];
  for (const candidate of sortedCandidates) {
    if (selected.some((surface) => shouldSuppressNestedSurface(candidate.element, surface.element))) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= 12) {
      break;
    }
  }

  return selected;
}

function shouldSuppressNestedSurface(candidate: HTMLElement, selected: HTMLElement): boolean {
  if (candidate === selected) {
    return true;
  }

  const candidateRect = getElementViewportRect(candidate);
  const selectedRect = getElementViewportRect(selected);
  const sameBounds =
    Math.abs(candidateRect.left - selectedRect.left) < 4 &&
    Math.abs(candidateRect.top - selectedRect.top) < 4 &&
    Math.abs(candidateRect.width - selectedRect.width) < 8 &&
    Math.abs(candidateRect.height - selectedRect.height) < 8;
  if (sameBounds) {
    return true;
  }

  return elementContainsDeep(selected, candidate) && getViewportAreaRatio(candidateRect) <= getViewportAreaRatio(selectedRect) * 0.92;
}

function countUsefulSurfaceChildren(element: HTMLElement): number {
  let count = 0;
  const stack = getDomChildElements(element);
  let scanned = 0;

  while (stack.length > 0 && scanned < 48) {
    const child = stack.shift()!;
    scanned++;
    if (child === element || isBarkanWidgetElement(child)) {
      continue;
    }

    if (isLikelyUsefulSurfaceChild(child) && isUsefulDomCandidate(child)) {
      count++;
    }

    if (count >= 8) {
      break;
    }

    if (scanned < 48) {
      stack.push(...getDomChildElements(child).slice(0, 8));
    }
  }

  return count;
}

function isLikelyUsefulSurfaceChild(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  return (
    ["button", "a", "input", "select", "textarea", "summary", "label", "th", "td"].includes(tagName) ||
    /^h[1-6]$/.test(tagName) ||
    /button|link|menuitem|tab|checkbox|radio|switch|option|cell|row|heading|textbox|combobox|searchbox/i.test(role) ||
    element.hasAttribute("onclick") ||
    element.tabIndex >= 0
  );
}

function findContainingActiveSurface(element: HTMLElement, drafts: ActiveSurfaceDraft[]): ActiveSurfaceDraft | null {
  const containingSurfaces = drafts
    .filter((draft) => elementContainsDeep(draft.element, element))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.area - right.area;
    });

  return containingSurfaces[0] ?? null;
}

function rememberActiveSurfaceFact(draft: ActiveSurfaceDraft | null, factId: string, label: string) {
  if (!draft) {
    return;
  }

  if (draft.surface.factIds.length < 80) {
    draft.surface.factIds.push(factId);
  }

  if (draft.surface.sampleLabels.length < 12 && !draft.surface.sampleLabels.includes(label)) {
    draft.surface.sampleLabels.push(label);
  }
}

function finalizeActiveSurfaces(drafts: ActiveSurfaceDraft[]): ActiveSurface[] {
  return drafts
    .filter((draft) => draft.surface.factIds.length > 0 || draft.surface.stacking.containsFocus)
    .map((draft) => draft.surface);
}

function buildSurfaceLabel(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label");
  const labelledBy = getElementTextById(element, element.getAttribute("aria-labelledby"));
  const heading = findFirstHeadingText(element);
  const title = element.getAttribute("title");
  return cleanDomText(ariaLabel || labelledBy || heading || title || "");
}

function describeSurfaceLayout(rect: DOMRect): ActiveSurface["layout"] {
  const widthRatio = roundRatio(rect.width / Math.max(1, window.innerWidth));
  const heightRatio = roundRatio(rect.height / Math.max(1, window.innerHeight));
  return {
    horizontalBand: describeHorizontalBand(rect),
    verticalBand: describeVerticalBand(rect),
    widthRatio,
    heightRatio,
    viewportAreaRatio: roundRatio(getViewportAreaRatio(rect))
  };
}

function describeHorizontalBand(rect: DOMRect): ActiveSurface["layout"]["horizontalBand"] {
  const viewportWidth = Math.max(1, window.innerWidth);
  if (rect.width / viewportWidth >= 0.82) {
    return "full";
  }

  const left = rect.left / viewportWidth;
  const right = rect.right / viewportWidth;
  const center = (rect.left + rect.right) / 2 / viewportWidth;
  if (left <= 0.12 && right >= 0.5) {
    return "spans";
  }
  if (right >= 0.88 && left <= 0.5) {
    return "spans";
  }
  if (center < 0.38) {
    return "left";
  }
  if (center > 0.62) {
    return "right";
  }
  return "center";
}

function describeVerticalBand(rect: DOMRect): ActiveSurface["layout"]["verticalBand"] {
  const viewportHeight = Math.max(1, window.innerHeight);
  if (rect.height / viewportHeight >= 0.82) {
    return "full";
  }

  const top = rect.top / viewportHeight;
  const bottom = rect.bottom / viewportHeight;
  const center = (rect.top + rect.bottom) / 2 / viewportHeight;
  if (top <= 0.12 && bottom >= 0.5) {
    return "spans";
  }
  if (bottom >= 0.88 && top <= 0.5) {
    return "spans";
  }
  if (center < 0.38) {
    return "top";
  }
  if (center > 0.62) {
    return "bottom";
  }
  return "middle";
}

function describeSurfaceStacking(element: HTMLElement, style: CSSStyleDeclaration): ActiveSurface["stacking"] {
  return {
    cssPosition: style.position || "static",
    zIndex: parseCssZIndex(style.zIndex),
    hasBackdrop: isElementTopLayerLike(element, element.getAttribute("role")?.toLowerCase() ?? ""),
    containsFocus: isElementOrDescendantFocused(element),
    pointerEvents: style.pointerEvents || "auto"
  };
}

function isElementOrDescendantFocused(element: HTMLElement): boolean {
  const activeElement = element.ownerDocument.activeElement;
  return isHtmlElement(activeElement) && elementContainsDeep(element, activeElement);
}

function isElementTopLayerLike(element: HTMLElement, role: string): boolean {
  const ariaModal = element.getAttribute("aria-modal")?.toLowerCase() === "true";
  const isOpenDialog = isHtmlDialogElement(element) && element.open;
  return ariaModal || isOpenDialog || role === "dialog" || role === "alertdialog" || isPopoverOpen(element);
}

function isPopoverOpen(element: HTMLElement): boolean {
  try {
    return element.matches(":popover-open");
  } catch {
    return false;
  }
}

function parseCssZIndex(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getViewportAreaRatio(rect: DOMRect): number {
  return (rect.width * rect.height) / Math.max(1, window.innerWidth * window.innerHeight);
}

function roundRatio(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function scoreVisibleCandidateForPrompt(
  element: Omit<UiFact, "id">,
  userPrompt: string,
  rect: DOMRect,
  visibility: "visible" | "partially_visible"
): number {
  let score = scoreCandidateForPrompt(element, userPrompt);

  if (isActionableUiFact(element)) {
    score += 42;
  } else if (element.kind === "heading") {
    score += 24;
  } else if (element.kind === "table") {
    score += 18;
  } else if (element.kind === "text") {
    score += 8;
  }

  if (visibility === "visible") {
    score += 8;
  }

  if (element.state.disabled) {
    score -= 18;
  }

  if (element.state.selected || element.metadata?.aria?.current) {
    score += 10;
  }

  const areaRatio = getViewportAreaRatio(rect);
  if (areaRatio > 0.35 && element.kind === "text") {
    score -= 16;
  }

  const verticalPosition = rect.top / Math.max(1, window.innerHeight);
  if (verticalPosition >= 0 && verticalPosition <= 0.9) {
    score += Math.round((1 - verticalPosition) * 4);
  }

  return score;
}

function isUsefulDomCandidate(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = getElementViewportRect(element);
  if (["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "SVG", "PATH"].includes(element.tagName)) {
    return false;
  }

  if (isPrimaryInteractiveDomElement(element)) {
    return rect.width >= 1 && rect.height >= 1;
  }

  if (style.pointerEvents === "none" || rect.width < 8 || rect.height < 8) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const hasUsefulTag = ["button", "a", "input", "select", "textarea", "summary", "label", "th", "td"].includes(
    tagName
  ) || /^h[1-6]$/.test(tagName);
  const hasUsefulRole = Boolean(
    role && /button|link|menuitem|tab|checkbox|radio|switch|option|cell|row|heading|textbox|combobox|searchbox/i.test(role)
  );
  const isClickable = Boolean(element.onclick || element.tabIndex >= 0);
  const isCompactText = isUsefulTextNodeCandidate(element);

  return hasUsefulTag || hasUsefulRole || isClickable || isCompactText;
}

function isNestedInsidePointableAncestor(element: HTMLElement): boolean {
  let current = getComposedParentElement(element);
  let depth = 0;
  while (current && current !== document.body && depth < 8) {
    if (
      current.matches("button,a,summary,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='option']")
    ) {
      return true;
    }
    current = getComposedParentElement(current);
    depth++;
  }
  return false;
}

function isUsefulTextNodeCandidate(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  if (/button|link|textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton|menuitem|tab|option/.test(role)) {
    return false;
  }

  const childCount = getDomChildElements(element).length;
  if (["div", "span"].includes(tagName) && childCount > 1) {
    return false;
  }

  const text = getElementVisibleText(element, 240);
  if (text.length < 2 || text.length > 220) {
    return false;
  }

  if (["p", "li", "dt", "dd", "figcaption", "small", "strong", "em", "span", "div"].includes(tagName)) {
    return childCount <= 2;
  }

  return false;
}

function getUiFactKind(element: HTMLElement): UiFactKind {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const inputType = isHtmlInputElement(element) ? element.type.toLowerCase() : "";

  if (role === "dialog" || role === "alertdialog" || tagName === "dialog") {
    return "modal";
  }

  if (/menu|menuitem|listbox|option/.test(role)) {
    return "menu";
  }

  if (/^h[1-6]$/.test(tagName) || role === "heading") {
    return "heading";
  }

  if (["table", "tr", "th", "td"].includes(tagName) || /table|row|cell|grid/.test(role)) {
    return "table";
  }

  if (tagName === "a" || role === "link") {
    return "link";
  }

  if (tagName === "button" || inputType === "button" || inputType === "submit" || role === "button") {
    return "button";
  }

  if (
    ["input", "select", "textarea"].includes(tagName) ||
    /textbox|checkbox|radio|switch|combobox|searchbox|slider|spinbutton|tab/.test(role)
  ) {
    return "input";
  }

  return "text";
}

function getUiFactState(element: HTMLElement, visible: boolean): UiFact["state"] {
  const ariaDisabled = element.getAttribute("aria-disabled")?.toLowerCase() === "true";
  const ariaSelected = element.getAttribute("aria-selected")?.toLowerCase() === "true";
  const ariaExpanded = element.getAttribute("aria-expanded")?.toLowerCase() === "true";
  const ariaRequired = element.getAttribute("aria-required")?.toLowerCase() === "true";

  return {
    visible,
    disabled: ariaDisabled || isDisabledFormControl(element),
    selected: ariaSelected || isSelectedControl(element),
    expanded: ariaExpanded,
    required: ariaRequired || isRequiredFormControl(element)
  };
}

function isDisabledFormControl(element: HTMLElement): boolean {
  return (
    (isHtmlButtonElement(element) ||
      isHtmlInputElement(element) ||
      isHtmlSelectElement(element) ||
      isHtmlTextAreaElement(element)) &&
    element.disabled
  );
}

function isSelectedControl(element: HTMLElement): boolean {
  return (
    (isHtmlInputElement(element) && element.checked) ||
    (isHtmlOptionElement(element) && element.selected)
  );
}

function isRequiredFormControl(element: HTMLElement): boolean {
  return (
    (isHtmlInputElement(element) ||
      isHtmlSelectElement(element) ||
      isHtmlTextAreaElement(element)) &&
    element.required
  );
}

function buildElementMetadata(element: HTMLElement): UiFactMetadata | undefined {
  const metadata: UiFactMetadata = {
    tagName: element.tagName.toLowerCase()
  };

  const domId = sanitizeMetadataValue(element.id, 80);
  if (domId && isSafeIdentifierValue(domId)) {
    metadata.domId = domId;
  }

  const name = getSafeAttributeValue(element, "name", 80);
  if (name) {
    metadata.name = name;
  }

  const type = getElementTypeMetadata(element);
  if (type) {
    metadata.type = type;
  }

  const value = getSafeElementValueMetadata(element);
  if (value) {
    metadata.value = value;
  }

  const testId = getTestIdMetadata(element);
  if (testId) {
    metadata.testId = testId;
  }

  const iconName = inferElementIconName(element);
  if (iconName) {
    metadata.iconName = iconName;
  }

  const classTokens = getSafeClassTokens(element);
  if (classTokens.length > 0) {
    metadata.classTokens = classTokens;
  }

  const data = getSafeDataAttributes(element);
  if (Object.keys(data).length > 0) {
    metadata.data = data;
  }

  const aria = getSafeAriaMetadata(element);
  if (Object.keys(aria).length > 0) {
    metadata.aria = aria;
  }

  const container = getElementContainerMetadata(element);
  if (container) {
    metadata.container = container;
  }

  return Object.keys(metadata).length > 1 ? metadata : undefined;
}

function getElementTypeMetadata(element: HTMLElement): string | undefined {
  if (
    isHtmlInputElement(element) ||
    isHtmlButtonElement(element) ||
    isHtmlSelectElement(element) ||
    isHtmlTextAreaElement(element)
  ) {
    return sanitizeMetadataValue(element.getAttribute("type") || element.tagName.toLowerCase(), 40);
  }

  return getSafeAttributeValue(element, "type", 40);
}

function getSafeElementValueMetadata(element: HTMLElement): string | undefined {
  const identityText = [
    element.getAttribute("name"),
    element.id,
    element.getAttribute("aria-label"),
    getElementTextById(element, element.getAttribute("aria-labelledby")),
    buildElementLabel(element)
  ].join(" ");
  if (isSensitiveName(identityText)) {
    return undefined;
  }

  if (isHtmlSelectElement(element)) {
    const selectedLabel = cleanDomText(
      Array.from(element.selectedOptions)
        .map((option) => option.label || option.textContent || option.value)
        .join(" ")
    );
    return sanitizeMetadataValue(selectedLabel, 100);
  }

  if (isHtmlInputElement(element) && ["checkbox", "radio"].includes(element.type.toLowerCase()) && element.checked) {
    return sanitizeMetadataValue(element.value, 80);
  }

  return undefined;
}

function getTestIdMetadata(element: HTMLElement): string | undefined {
  for (const attribute of ["data-testid", "data-test-id", "data-cy", "data-qa"]) {
    const value = getSafeAttributeValue(element, attribute, 100);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function getSafeAriaMetadata(element: HTMLElement): NonNullable<UiFactMetadata["aria"]> {
  const aria: NonNullable<UiFactMetadata["aria"]> = {};
  const controls = getSafeAttributeValue(element, "aria-controls", 120);
  const describedBy = getSafeAttributeValue(element, "aria-describedby", 120);
  const current = getSafeAttributeValue(element, "aria-current", 40);
  const hasPopup = getSafeAttributeValue(element, "aria-haspopup", 40);
  const live = getSafeAttributeValue(element, "aria-live", 40);

  if (controls) {
    aria.controls = controls;
  }
  if (describedBy) {
    aria.describedBy = describedBy;
  }
  if (current) {
    aria.current = current;
  }
  if (hasPopup) {
    aria.hasPopup = hasPopup;
  }
  if (live) {
    aria.live = live;
  }

  const pressed = parseAriaBoolean(element.getAttribute("aria-pressed"));
  if (pressed !== undefined) {
    aria.pressed = pressed;
  }

  const checked = parseAriaChecked(element.getAttribute("aria-checked"));
  if (checked !== undefined) {
    aria.checked = checked;
  }

  const invalid = parseAriaBoolean(element.getAttribute("aria-invalid"));
  if (invalid !== undefined) {
    aria.invalid = invalid;
  }

  return aria;
}

function getElementContainerMetadata(element: HTMLElement): UiFactMetadata["container"] | undefined {
  let current = getComposedParentElement(element);
  let depth = 0;

  while (current && current !== document.body && depth < 7) {
    if (isBarkanWidgetElement(current)) {
      return undefined;
    }

    const kind = getSemanticContainerKind(current);
    if (kind) {
      const label = findContainerLabel(current, element);
      const role = getSafeAttributeValue(current, "role", 60);
      const index = getSemanticContainerIndex(current, kind);
      return {
        kind,
        ...(label ? { label } : {}),
        ...(role ? { role } : {}),
        ...(index ? { index } : {})
      };
    }

    current = getComposedParentElement(current);
    depth++;
  }

  return undefined;
}

function getSemanticContainerKind(element: HTMLElement): NonNullable<UiFactMetadata["container"]>["kind"] | null {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const classText = Array.from(element.classList).slice(0, 12).join(" ").toLowerCase();
  const dataText = [
    element.getAttribute("data-component"),
    element.getAttribute("data-role"),
    element.getAttribute("data-kind"),
    element.getAttribute("data-type"),
    element.getAttribute("data-item"),
    element.getAttribute("data-testid")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const semanticText = `${role} ${classText} ${dataText}`;

  if (tagName === "tr" || role === "row" || /\b(table-row|data-row|list-row|row-item)\b/.test(semanticText)) {
    return "row";
  }
  if (tagName === "li" || role === "listitem" || /\b(list-item|listitem|menu-item)\b/.test(semanticText)) {
    return "listitem";
  }
  if (tagName === "article" || /\b(card|tile|panel-card|result-card|product-card|repo-card|issue-card)\b/.test(semanticText)) {
    return "card";
  }
  if (tagName === "form" || role === "form") {
    return "form";
  }
  if (tagName === "section" || role === "region") {
    return "section";
  }
  if (role === "group" || /\b(group|item|record|entity|resource)\b/.test(semanticText)) {
    return "group";
  }

  return null;
}

function findContainerLabel(container: HTMLElement, target: HTMLElement): string {
  const directLabel = cleanDomText(
    container.getAttribute("aria-label") ||
      getElementTextById(container, container.getAttribute("aria-labelledby")) ||
      container.getAttribute("data-name") ||
      container.getAttribute("data-title") ||
      container.getAttribute("title") ||
      ""
  );
  if (directLabel) {
    return directLabel.slice(0, 180);
  }

  const selectors = [
    "h1,h2,h3,h4,h5,h6,[role='heading']",
    "[data-title],[data-name],[data-label]",
    "a[href]",
    "strong,b",
    "th",
    "[role='cell'],td",
    "p,span"
  ];
  for (const selector of selectors) {
    const label = findFirstContainerLabelCandidate(container, target, selector);
    if (label) {
      return label;
    }
  }

  return "";
}

function findFirstContainerLabelCandidate(container: HTMLElement, target: HTMLElement, selector: string): string {
  let scanned = 0;
  for (const candidate of iterateHtmlDescendants(container, 120)) {
    if (!candidate.matches(selector)) {
      continue;
    }
    scanned++;
    if (scanned > 24) {
      break;
    }
    if (candidate === target || elementContainsDeep(target, candidate) || isBarkanWidgetElement(candidate)) {
      continue;
    }
    if (!candidate.isConnected || !elementContainsDeep(container, candidate)) {
      continue;
    }
    const text = cleanDomText(
      candidate.getAttribute("data-title") ||
        candidate.getAttribute("data-name") ||
        candidate.getAttribute("data-label") ||
        candidate.getAttribute("aria-label") ||
        candidate.getAttribute("title") ||
        candidate.textContent ||
        ""
    );
    if (text.length >= 2 && text.length <= 180) {
      return text;
    }
  }
  return "";
}

function getSemanticContainerIndex(
  element: HTMLElement,
  kind: NonNullable<UiFactMetadata["container"]>["kind"]
): number | undefined {
  let index = 1;
  let sibling = element.previousElementSibling;
  while (isHtmlElement(sibling) && index < 500) {
    if (getSemanticContainerKind(sibling) === kind) {
      index++;
    }
    sibling = sibling.previousElementSibling;
  }
  return index > 1 ? index : undefined;
}

function parseAriaBoolean(value: string | null): boolean | undefined {
  if (value?.toLowerCase() === "true") {
    return true;
  }
  if (value?.toLowerCase() === "false") {
    return false;
  }
  return undefined;
}

function parseAriaChecked(value: string | null): boolean | "mixed" | undefined {
  if (value?.toLowerCase() === "mixed") {
    return "mixed";
  }
  return parseAriaBoolean(value);
}

function getSafeClassTokens(element: HTMLElement): string[] {
  const tokens: string[] = [];
  for (const token of Array.from(element.classList)) {
    const cleaned = sanitizeMetadataValue(token, 40);
    if (!cleaned || !isMeaningfulClassToken(cleaned) || tokens.includes(cleaned)) {
      continue;
    }

    tokens.push(cleaned);
    if (tokens.length >= 6) {
      break;
    }
  }

  return tokens;
}

function getSafeDataAttributes(element: HTMLElement): Record<string, string> {
  const data: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (!attribute.name.startsWith("data-")) {
      continue;
    }

    const key = attribute.name.slice(5);
    if (!isAllowedDataAttribute(key) || Object.keys(data).length >= 10) {
      continue;
    }

    const value = sanitizeMetadataValue(attribute.value, 120);
    if (!value || !isSafeMetadataValue(value)) {
      continue;
    }

    data[key] = value;
  }

  return data;
}

function getSafeAttributeValue(element: HTMLElement, attribute: string, maxLength: number): string | undefined {
  const value = sanitizeMetadataValue(element.getAttribute(attribute), maxLength);
  return value && isSafeMetadataValue(value) ? value : undefined;
}

function sanitizeMetadataValue(value: string | null | undefined, maxLength: number): string | undefined {
  const cleaned = cleanDomText(value ?? "");
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, maxLength);
}

function isAllowedDataAttribute(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  if (isSensitiveName(normalizedKey)) {
    return false;
  }

  return (
    /^(testid|test-id|cy|qa|action|route|state|component|entity|id|item-id|itemid|key|name|status|kind|type|view|screen|role|target|mode|variant|index|slug)$/i.test(
      normalizedKey
    ) || /^(app|ui|barkan|route|nav|page|panel|modal|tab|menu|item)-/.test(normalizedKey)
  );
}

function isSafeIdentifierValue(value: string): boolean {
  if (!isSafeMetadataValue(value) || isSensitiveName(value)) {
    return false;
  }

  if (/^[a-f0-9]{12,}$/i.test(value) || /\d{8,}/.test(value)) {
    return false;
  }

  return true;
}

function isSafeMetadataValue(value: string): boolean {
  if (value.length > 140 || isSensitiveName(value)) {
    return false;
  }

  if (/^[\[{]/.test(value) || /bearer\s+|eyJ[a-zA-Z0-9_-]{12,}|sk-[a-zA-Z0-9_-]+/i.test(value)) {
    return false;
  }

  if (/[^\s:@/]{80,}/.test(value)) {
    return false;
  }

  return true;
}

function isSensitiveName(value: string): boolean {
  const normalizedValue = value.replace(/[_\-\s]+/g, "").toLowerCase();
  return /(token|secret|password|passwd|passcode|auth|session|cookie|csrf|jwt|email|phone|address|creditcard|cardnumber|ccnumber|iban|ssn|socialsecurity|privatekey|signature)/.test(
    normalizedValue
  );
}

function isMeaningfulClassToken(token: string): boolean {
  if (token.length < 3 || token.length > 40 || isSensitiveName(token)) {
    return false;
  }

  if (/[:\[\]/]/.test(token) || /^(css|sc)-[a-z0-9]+$/i.test(token) || /^[a-z0-9_-]*\d[a-z0-9_-]*\d[a-z0-9_-]*\d/i.test(token)) {
    return false;
  }

  if (
    /^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|static|overflow|items|justify|content|self|place|gap|p[trblxy]?|m[trblxy]?|w|h|min|max|text|font|leading|tracking|bg|border|rounded|shadow|ring|opacity|z|top|right|bottom|left|translate|scale|rotate|duration|ease|transition|container)(-|$)/i.test(
      token
    )
  ) {
    return false;
  }

  return true;
}

function flattenMetadataText(metadata: UiFactMetadata | undefined): string {
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

function buildElementContext(element: HTMLElement, cache: Map<HTMLElement, string>): string {
  let current = getComposedParentElement(element);
  let depth = 0;
  const visited: HTMLElement[] = [];

  while (current && current !== document.body && depth < 7) {
    const cachedContext = cache.get(current);
    if (cachedContext !== undefined) {
      return cachedContext;
    }

    visited.push(current);
    const ariaContext = cleanDomText(
      current.getAttribute("aria-label") ||
        getElementTextById(current, current.getAttribute("aria-labelledby")) ||
        ""
    );
    const localHeading = findNearestContextHeading(element, current);
    const heading = findFirstHeadingText(current);
    if (ariaContext || localHeading || heading) {
      const description = heading ? findFirstDescriptionText(current, heading) : "";
      const context = uniqueCleanLabels([ariaContext, localHeading, heading, description].filter(Boolean), 4).join(" ").slice(0, 240);
      visited.forEach((visitedElement) => cache.set(visitedElement, context));
      return context;
    }

    current = getComposedParentElement(current);
    depth++;
  }

  visited.forEach((visitedElement) => cache.set(visitedElement, ""));
  return "";
}

function findNearestContextHeading(element: HTMLElement, boundary: HTMLElement): string {
  let current: HTMLElement | null = element;
  const boundaryParent = getComposedParentElement(boundary);
  let depth = 0;
  while (current && current !== boundaryParent && current !== document.body && depth < 6) {
    let sibling = current.previousElementSibling;
    let hops = 0;
    while (isHtmlElement(sibling) && hops < 10) {
      const heading = elementToHeadingText(sibling) || findLastHeadingText(sibling);
      if (heading) {
        return heading;
      }
      sibling = sibling.previousElementSibling;
      hops++;
    }

    current = getComposedParentElement(current);
    depth++;
  }

  return "";
}

function findFirstHeadingText(root: HTMLElement): string {
  const heading = Array.from(iterateHtmlDescendants(root, 120)).find((element) => Boolean(elementToHeadingText(element)));
  return heading ? elementToHeadingText(heading) : "";
}

function findLastHeadingText(root: HTMLElement): string {
  const headings = Array.from(iterateHtmlDescendants(root, 160)).filter((element) => Boolean(elementToHeadingText(element)));
  for (const heading of headings.reverse()) {
    const text = elementToHeadingText(heading);
    if (text) {
      return text;
    }
  }
  return "";
}

function elementToHeadingText(element: HTMLElement): string {
  if (!/^h[1-6]$/i.test(element.tagName) && element.getAttribute("role")?.toLowerCase() !== "heading") {
    return "";
  }
  return cleanDomText(element.textContent || "");
}

function findFirstDescriptionText(root: HTMLElement, heading: string): string {
  const paragraphs = Array.from(iterateHtmlDescendants(root, 120)).filter((element) => element.matches("p,[data-description]"));
  for (const paragraph of paragraphs) {
    const text = cleanDomText(paragraph.textContent || "");
    if (text && text !== heading) {
      return text.slice(0, 140);
    }
  }
  return "";
}

function getElementTextById(owner: HTMLElement, id: string | null): string {
  if (!id) {
    return "";
  }

  return id
    .split(/\s+/)
    .map((part) => findElementByIdInAccessibleScope(owner, part)?.textContent ?? "")
    .join(" ");
}

function getViewportVisibility(rect: DOMRect): "visible" | "partially_visible" | "above" | "below" {
  const intersectsViewport =
    rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  if (intersectsViewport) {
    const fullyVisible =
      rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
    return fullyVisible ? "visible" : "partially_visible";
  }

  return rect.bottom <= 0 ? "above" : "below";
}

function collectScrollSurfaces(surfaceMap: Map<Element, string>, candidates: HTMLElement[]): ScrollSurface[] {
  const surfaces: ScrollSurface[] = [getPageScrollSurface()];
  let surfaceSequence = 0;

  for (const element of candidates) {
    if (isBarkanWidgetElement(element)) {
      continue;
    }

    if (!isVisibleScrollableContainer(element)) {
      continue;
    }

    surfaceSequence++;
    const id = `s${surfaceSequence}`;
    surfaceMap.set(element, id);
    const rect = getElementViewportRect(element);
    surfaces.push({
      id,
      kind: "container",
      label: buildElementLabel(element) || element.getAttribute("aria-label") || element.tagName.toLowerCase(),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      scrollTop: Math.round(element.scrollTop),
      scrollHeight: Math.round(element.scrollHeight),
      clientHeight: Math.round(element.clientHeight),
      canScrollUp: element.scrollTop > 4,
      canScrollDown: element.scrollTop + element.clientHeight < element.scrollHeight - 4
    });

    if (surfaces.length >= 7) {
      break;
    }
  }

  return surfaces;
}

function getPageScrollSurface(): ScrollSurface {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const scrollTop = window.scrollY || scrollingElement.scrollTop;
  const layoutScrollHeight = Math.max(
    scrollingElement.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.scrollHeight
  );
  const clientHeight = window.innerHeight;
  const scrollHeight = layoutScrollHeight;
  const canScrollUp = scrollTop > 4;
  const canScrollDown = scrollTop + clientHeight < scrollHeight - 4;

  return {
    id: "page",
    kind: "page",
    label: "main page",
    rect: {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight
    },
    scrollTop: Math.round(scrollTop),
    scrollHeight: Math.round(scrollHeight),
    clientHeight: Math.round(clientHeight),
    canScrollUp,
    canScrollDown
  };
}

function isVisibleScrollableContainer(element: HTMLElement): boolean {
  if (isElementEffectivelyHiddenForCleanDom(element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.pointerEvents === "none") {
    return false;
  }

  const canScrollY = /(auto|scroll)/i.test(style.overflowY) && element.scrollHeight > element.clientHeight + 8;
  if (!canScrollY) {
    return false;
  }

  const rect = getElementViewportRect(element);
  if (rect.width < 80 || rect.height < 80) {
    return false;
  }

  if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
    return false;
  }

  return element.scrollTop > 4 || element.scrollTop + element.clientHeight < element.scrollHeight - 4;
}

function findContainingScrollSurfaceId(element: HTMLElement, surfaceMap: Map<Element, string>): string | undefined {
  let current: HTMLElement | null = getComposedParentElement(element);
  while (current) {
    const surfaceId = surfaceMap.get(current);
    if (surfaceId) {
      return surfaceId;
    }
    current = getComposedParentElement(current);
  }
  return undefined;
}

function findScrollableContainerById(surfaceId: string): HTMLElement | null {
  const surfaceMap = new Map<Element, string>();
  collectScrollSurfaces(surfaceMap, collectDomCaptureCandidates());
  for (const [element, id] of surfaceMap.entries()) {
    if (id === surfaceId && isHtmlElement(element)) {
      return element;
    }
  }
  return null;
}

function isBarkanWidgetElement(element: HTMLElement): boolean {
  return (
    element.id === "barkan-widget-root" ||
    Boolean(element.closest("#barkan-widget-root"))
  );
}

function canScrollSurface(surface: ScrollSurface, direction: "up" | "down"): boolean {
  return direction === "down" ? surface.canScrollDown : surface.canScrollUp;
}

interface HorizontalScrollState {
  windowX: number;
  container: HTMLElement | null;
  containerLeft: number;
}

function findNearestVerticalScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = getComposedParentElement(element);
  while (current && current !== document.body && current !== document.documentElement) {
    if (!isBarkanWidgetElement(current)) {
      const style = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll|overlay)/i.test(style.overflowY) && current.scrollHeight > current.clientHeight + 4;
      if (canScrollY) {
        return current;
      }
    }
    current = getComposedParentElement(current);
  }

  return null;
}

function isScrollRevealableCleanDomElement(element: DomElementSnapshot): boolean {
  if (element.visibility === "outside") {
    return false;
  }

  return element.rect.width >= 1 && element.rect.height >= 1;
}

function hasHiddenAncestorForScrolling(element: HTMLElement): boolean {
  return isElementEffectivelyHiddenForCleanDom(element);
}

function isActiveScrollRevealContainer(element: HTMLElement): boolean {
  const rect = getElementViewportRect(element);
  if (rect.width < 1 || rect.height < 1 || !isVerticallyVisibleInViewport(rect) || rect.right <= 0 || rect.left >= window.innerWidth) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.pointerEvents !== "none" && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isVerticallyVisibleInViewport(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function calculateVerticalRevealDelta(rect: DOMRect, viewportTop: number, viewportHeight: number): number {
  const margin = Math.min(80, Math.max(24, viewportHeight * 0.12));
  const visibleTop = viewportTop + margin;
  const visibleBottom = viewportTop + viewportHeight - margin;
  if (rect.top >= visibleTop && rect.bottom <= visibleBottom) {
    return 0;
  }

  const rectCenter = rect.top + rect.height / 2;
  const viewportCenter = viewportTop + viewportHeight / 2;
  return Math.round(rectCenter - viewportCenter);
}

function captureHorizontalScrollState(container: HTMLElement | null): HorizontalScrollState {
  return {
    windowX: window.scrollX,
    container,
    containerLeft: container?.scrollLeft ?? 0
  };
}

function restoreHorizontalScrollState(state: HorizontalScrollState) {
  if (Math.abs(window.scrollX - state.windowX) > 1) {
    window.scrollTo(state.windowX, window.scrollY);
  }

  if (state.container && Math.abs(state.container.scrollLeft - state.containerLeft) > 1) {
    state.container.scrollLeft = state.containerLeft;
  }
}

function findOffscreenContinuationTarget(snapshot: DomSnapshot, elementId: string, userPrompt: string): string | null {
  const visibleElement = snapshot.uiFacts.find((candidate) => candidate.id === elementId);
  if (!visibleElement || !isSectionSummaryElement(visibleElement) || !isContentSeekingPrompt(userPrompt)) {
    return null;
  }

  return findBestOffscreenTarget(snapshot, `${userPrompt} ${visibleElement.label} ${visibleElement.context ?? ""}`);
}

function findVisibleContinuationTarget(snapshot: DomSnapshot, elementId: string, userPrompt: string): string | null {
  const visibleElement = snapshot.uiFacts.find((candidate) => candidate.id === elementId);
  if (!visibleElement || !isSectionSummaryElement(visibleElement) || !isContentSeekingPrompt(userPrompt)) {
    return null;
  }

  const searchText = `${userPrompt} ${visibleElement.label} ${visibleElement.context ?? ""}`;
  const scoredCandidates = snapshot.uiFacts
    .filter((candidate) => candidate.id !== elementId)
    .filter((candidate) => isContentElement(candidate) || isActionableUiFact(candidate))
    .filter((candidate) => sharesContext(candidate, visibleElement))
    .map((candidate) => ({
      candidate,
      score: scoreSnapshotElementForSearch(candidate, searchText)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.candidate.rect.y - right.candidate.rect.y;
    });

  return scoredCandidates[0]?.candidate.id ?? null;
}

function findImplicitScrollTarget(snapshot: DomSnapshot, userPrompt: string, spokenText: string): string | null {
  if (!/\b(scroll|down|below|lower|bring|show)\b/i.test(spokenText)) {
    return null;
  }

  return findBestOffscreenTarget(snapshot, `${userPrompt} ${spokenText}`);
}

function findBestOffscreenTarget(snapshot: DomSnapshot, searchText: string): string | null {
  const scoredCandidates = snapshot.offscreenUiFacts
    .filter((candidate) => isContentElement(candidate) || isActionableUiFact(candidate))
    .map((candidate) => ({
      candidate,
      score: scoreSnapshotElementForSearch(candidate, searchText)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return Math.abs(left.candidate.rect.y) - Math.abs(right.candidate.rect.y);
    });

  return scoredCandidates[0]?.candidate.id ?? null;
}

function sharesContext(left: UiFact, right: UiFact): boolean {
  const leftContext = normalizeSearchText(left.context || left.label);
  const rightContext = normalizeSearchText(right.context || right.label);
  if (!leftContext || !rightContext) {
    return false;
  }

  return leftContext.includes(rightContext) || rightContext.includes(leftContext) || leftContext === rightContext;
}

function scoreSnapshotElementForSearch(element: Omit<UiFact, "id">, searchText: string): number {
  const queryTokens = tokenizeForSearch(searchText);
  const labelText = element.label.toLowerCase();
  const contextText = (element.context ?? "").toLowerCase();
  const combinedText = [element.label, element.text, element.context, element.role, element.kind, element.href, flattenMetadataText(element.metadata)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (labelText.includes(token)) {
      score += 5;
    } else if (contextText.includes(token)) {
      score += 4;
    } else if (combinedText.includes(token)) {
      score += 2;
    }
  }
  if (isContentElement(element)) {
    score += 4;
  }
  return score;
}

function isSectionSummaryElement(element: UiFact): boolean {
  return (
    element.kind === "heading" ||
    (element.kind === "text" && Boolean(element.context) && element.label.length <= 80)
  );
}

function isContentElement(element: Pick<UiFact, "kind" | "label">): boolean {
  if (element.kind === "table") {
    return true;
  }

  return element.kind === "text" && element.label.length > 12;
}

function isActionableUiFact(element: Pick<UiFact, "kind">): boolean {
  return ["button", "link", "input", "menu"].includes(element.kind);
}

function resolvePointTarget(pageContext: PageContext, requestedElementId: string | null): ResolvedPointTarget | null {
  if (!requestedElementId) {
    return null;
  }

  const snapshotElement = findCleanDomElementById(pageContext.snapshot.elements, requestedElementId);
  if (snapshotElement?.state?.hidden === true || snapshotElement?.state?.ancestorHidden === true) {
    return null;
  }

  const snapshotFact = snapshotElement ? null : findSnapshotUiFactById(pageContext.snapshot, requestedElementId);
  const liveTarget = findLiveDomTargetCenter(pageContext, requestedElementId);
  if (liveTarget) {
    return {
      x: liveTarget.x,
      y: liveTarget.y,
      elementId: requestedElementId,
      label: snapshotElement?.label || snapshotElement?.text || snapshotFact?.label,
      source: "live"
    };
  }

  if (snapshotElement && !isPointableCleanDomElement(snapshotElement)) {
    return null;
  }

  const snapshotTarget = snapshotElement ? findCleanDomElementCenter(snapshotElement) : null;
  if (snapshotTarget) {
    return {
      x: snapshotTarget.x,
      y: snapshotTarget.y,
      elementId: requestedElementId,
      label: snapshotElement?.label || snapshotElement?.text,
      source: "snapshot"
    };
  }

  if (snapshotFact && isPointableUiFact(snapshotFact)) {
    return {
      x: snapshotFact.rect.x + snapshotFact.rect.width / 2,
      y: snapshotFact.rect.y + snapshotFact.rect.height / 2,
      elementId: requestedElementId,
      label: snapshotFact.label,
      source: "snapshot"
    };
  }

  return null;
}

function findSnapshotUiFactById(snapshot: DomSnapshot, elementId: string): UiFact | null {
  return (
    snapshot.uiFacts.find((candidate) => candidate.id === elementId) ??
    snapshot.offscreenUiFacts.find((candidate) => candidate.id === elementId) ??
    null
  );
}

function isPointableUiFact(element: UiFact): boolean {
  return element.state.visible && element.rect.width >= 1 && element.rect.height >= 1;
}

function findGuidanceClickElement(pageContext: PageContext, elementId: string): HTMLElement | null {
  const target = pageContext.targetElements.get(elementId);
  if (!target) {
    return null;
  }

  return findPreferredLivePointableElement(target);
}

function shouldInferFurtherGuidanceFromSpokenText(text: string): boolean {
  const normalizedText = normalizeGuidancePhraseText(text);
  if (!normalizedText) {
    return false;
  }

  const mentionsNextStep =
    /\b(?:use|click|press|tap|open|select|choose)\b.{0,140}\b(?:to|then|after|look for|find|show|open|access|choose|select)\b/i.test(
      normalizedText
    ) ||
    /\b(?:use|click|press|tap|open|select|choose)\b.{0,100}\b(?:panel|tab|menu|section|view|drawer|sidebar|first)\b/i.test(
      normalizedText
    ) ||
    /\b(?:look for|find|then|after that|next)\b.{0,120}\b(?:option|button|control|menu|panel|submenu|settings|action)\b/i.test(
      normalizedText
    );
  const mentionsOpenerOrDeferredControl =
    /\b(?:edit|settings|options?|more|menu|submenu|panel|dialog|drawer|dropdown|tab|section|view|move|reorder|sort|left|right|up|down|next|previous)\b/i.test(
      normalizedText
    ) || extractNamedOpenerTokens(normalizedText).length > 0;
  return mentionsNextStep && mentionsOpenerOrDeferredControl;
}

function inferGuidanceOpenerFromSpokenText(
  pageContext: PageContext,
  prompt: string,
  spokenText: string
): { elementId: string; label?: string } | null {
  const requestedTokens = extractLikelyOpenerTokens(spokenText);
  if (requestedTokens.length === 0) {
    return null;
  }

  const candidates = flattenCleanDomElements(pageContext.snapshot.elements)
    .filter((element) => element.interactive)
    .filter((element) => element.visibility === "visible" || element.visibility === "partially_visible")
    .filter((element) => element.state?.ancestorHidden !== true)
    .map((element) => ({
      element,
      searchText: getCleanDomElementSearchText(element)
    }))
    .filter(({ searchText }) => requestedTokens.some((token) => searchText.includes(token)));

  if (candidates.length === 0) {
    return null;
  }

  const visibleCandidates = candidates.filter(({ element }) => element.state?.hidden !== true);
  const orderedCandidates = (visibleCandidates.length > 0 ? visibleCandidates : candidates).sort((left, right) => {
    const leftScore = scoreGuidanceOpenerTokenMatch(left.searchText, requestedTokens);
    const rightScore = scoreGuidanceOpenerTokenMatch(right.searchText, requestedTokens);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.element.rect.y - right.element.rect.y || left.element.rect.x - right.element.rect.x;
  });
  const ordinalIndex = getPromptOrdinalIndex(prompt, orderedCandidates.length);
  const selected = orderedCandidates[ordinalIndex]?.element ?? orderedCandidates[0]?.element;
  if (!selected) {
    return null;
  }

  return {
    elementId: selected.id,
    label: selected.label || selected.text
  };
}

function extractLikelyOpenerTokens(text: string): string[] {
  const normalizedText = normalizeGuidancePhraseText(text);
  const tokens: string[] = [];
  const tokenGroups: Array<[string, RegExp]> = [
    ["edit", /\b(?:edit|modify|pencil)\b/i],
    ["settings", /\b(?:settings|preferences|parameters|parametres|parametres|paramètres)\b/i],
    ["options", /\b(?:options?|more|ellipsis|menu|submenu|dropdown|actions?)\b/i],
    ["move", /\b(?:move|reorder|sort|position|left|right|up|down|previous|next)\b/i]
  ];

  for (const [token, pattern] of tokenGroups) {
    if (pattern.test(normalizedText)) {
      tokens.push(token);
    }
  }

  if (tokens.includes("move") && !tokens.includes("edit") && !tokens.includes("settings") && !tokens.includes("options")) {
    tokens.push("edit", "settings", "options");
  }

  for (const token of extractNamedOpenerTokens(normalizedText)) {
    if (!tokens.includes(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

function extractNamedOpenerTokens(normalizedText: string): string[] {
  const tokens: string[] = [];
  const patterns = [
    /\b(?:open|click|press|tap|select|choose|use|go to)\s+(?:the\s+)?([a-z0-9 ]{3,80}?)\s+(?:panel|tab|menu|section|view|page|drawer|sidebar|button)\b/g,
    /\b(?:open|click|press|tap|select|choose|use)\s+(?:the\s+)?([a-z0-9 ]{3,80}?)(?:\s+first|\s+then|\s+so\b|\s+to\b|$)/g
  ];

  for (const pattern of patterns) {
    for (const match of normalizedText.matchAll(pattern)) {
      const phrase = match[1] ?? "";
      for (const token of tokenizeNamedOpenerPhrase(phrase)) {
        if (!tokens.includes(token)) {
          tokens.push(token);
        }
      }
    }
  }

  return tokens;
}

function tokenizeNamedOpenerPhrase(phrase: string): string[] {
  const descriptorWords = new Set([
    "action",
    "button",
    "control",
    "drawer",
    "first",
    "icon",
    "menu",
    "option",
    "page",
    "panel",
    "section",
    "sidebar",
    "tab",
    "view"
  ]);
  return normalizeSearchText(phrase)
    .split(" ")
    .filter((token) => token.length > 2 && !descriptorWords.has(token))
    .slice(0, 4);
}

function scoreGuidanceOpenerTokenMatch(searchText: string, tokens: string[]): number {
  return tokens.reduce((score, token) => score + (searchText.includes(token) ? 1 : 0), 0);
}

function getPromptOrdinalIndex(prompt: string, candidateCount: number): number {
  const normalizedPrompt = normalizeSearchText(prompt);
  if (/\b(?:first|1st|one|premier|premiere|première)\b/.test(normalizedPrompt)) {
    return 0;
  }
  if (/\b(?:last|final)\b/.test(normalizedPrompt)) {
    return Math.max(0, candidateCount - 1);
  }
  if (/\b(?:second|2nd|two|deux|deuxieme|deuxième)\b/.test(normalizedPrompt)) {
    return Math.min(1, Math.max(0, candidateCount - 1));
  }
  return 0;
}

function flattenCleanDomElements(elements: DomElementSnapshot[]): DomElementSnapshot[] {
  return elements.flatMap((element) => [element, ...flattenCleanDomElements(element.children ?? [])]);
}

function getCleanDomElementSearchText(element: DomElementSnapshot): string {
  return normalizeSearchText(
    [
      element.tag,
      element.role,
      element.label,
      element.text,
      ...Object.entries(element.attributes ?? {}).flatMap(([key, value]) => [key, value])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isContentSeekingPrompt(prompt: string): boolean {
  return /\b(latest|recent|first|last|activity|activities|event|events|item|row|entry|details?|content|record|status|value|owner|account)\b/i.test(
    prompt
  );
}

function scoreCandidateForPrompt(element: Omit<UiFact, "id">, userPrompt: string): number {
  const queryTokens = tokenizeForSearch(userPrompt);
  if (queryTokens.length === 0) {
    return 0;
  }

  const searchableText = [
    element.label,
    element.text,
    element.context,
    element.role,
    element.kind,
    element.href,
    flattenMetadataText(element.metadata)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  const labelText = element.label.toLowerCase();
  const contextText = (element.context ?? "").toLowerCase();
  for (const token of queryTokens) {
    if (labelText.includes(token)) {
      score += 4;
    } else if (contextText.includes(token)) {
      score += 3;
    } else if (searchableText.includes(token)) {
      score += 2;
    }
  }

  const normalizedPrompt = queryTokens.join(" ");
  if (normalizedPrompt.length > 3 && searchableText.includes(normalizedPrompt)) {
    score += 8;
  }

  if (contextText && isContentSeekingPrompt(userPrompt) && isContentElement(element)) {
    score += 6;
  }

  return score;
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

  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .map(normalizeSearchToken)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 12);
}

function normalizeSearchToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeSearchText(text: string): string {
  return tokenizeForSearch(text).join(" ");
}

function normalizeGuidancePhraseText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHtmlAnchorElement(element: Element): element is HTMLAnchorElement {
  return isElementOfType(element, "HTMLAnchorElement");
}

function isHtmlButtonElement(element: Element): element is HTMLButtonElement {
  return isElementOfType(element, "HTMLButtonElement");
}

function isHtmlDialogElement(element: Element): element is HTMLDialogElement {
  return isElementOfType(element, "HTMLDialogElement");
}

function isHtmlFormElement(element: Element): element is HTMLFormElement {
  return isElementOfType(element, "HTMLFormElement");
}

function isHtmlImageElement(element: Element): element is HTMLImageElement {
  return isElementOfType(element, "HTMLImageElement");
}

function isHtmlInputElement(element: Element): element is HTMLInputElement {
  return isElementOfType(element, "HTMLInputElement");
}

function isHtmlOptionElement(element: Element): element is HTMLOptionElement {
  return isElementOfType(element, "HTMLOptionElement");
}

function isHtmlSelectElement(element: Element): element is HTMLSelectElement {
  return isElementOfType(element, "HTMLSelectElement");
}

function isHtmlTextAreaElement(element: Element): element is HTMLTextAreaElement {
  return isElementOfType(element, "HTMLTextAreaElement");
}

function isSvgElement(element: Element): element is SVGElement {
  return isElementOfType(element, "SVGElement");
}

function isSvgUseElement(element: Element): element is SVGUseElement {
  return isElementOfType(element, "SVGUseElement");
}

function buildElementLabel(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label");
  const labelledBy = getElementTextById(element, element.getAttribute("aria-labelledby"));
  const associatedLabel = getAssociatedControlLabel(element);
  const title = element.getAttribute("title");
  const placeholder = element.getAttribute("placeholder");
  const alt = element.getAttribute("alt");
  const directText = getDirectText(element);
  const visibleText = shouldUseSubtreeTextForLabel(element) ? getElementVisibleText(element, 180) : "";
  const childMediaLabel = getChildMediaLabel(element);
  const hrefLabel = inferElementHrefLabel(element);
  const iconLabel = inferElementIconLabel(element, {
    includeDescendants: shouldInferDescendantIconLabel(element)
  });
  return cleanDomText(
    ariaLabel ||
      labelledBy ||
      associatedLabel ||
      title ||
      placeholder ||
      alt ||
      directText ||
      visibleText ||
      childMediaLabel ||
      hrefLabel ||
      iconLabel
  );
}

function getDirectText(element: HTMLElement): string {
  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ");

  return cleanDomText(text);
}

function getElementVisibleText(element: HTMLElement, maxLength = 180): string {
  return cleanDomText(element.textContent || "").slice(0, maxLength);
}

function getChildMediaLabel(element: HTMLElement): string {
  const labels = Array.from(iterateHtmlDescendants(element, 64))
    .filter((child) => child.matches("img[alt],svg[aria-label],svg title,[data-icon],[data-lucide]"))
    .slice(0, 4)
    .map((child) => {
      if (isHtmlImageElement(child)) {
        return child.alt || humanizeIdentifier(child.getAttribute("src")?.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "");
      }

      if (child.tagName.toLowerCase() === "title") {
        return child.textContent ?? "";
      }

      return child.getAttribute("aria-label") || inferElementIconLabel(child);
    })
    .filter(Boolean);

  return cleanDomText(labels.join(" "));
}

function shouldUseSubtreeTextForLabel(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  return (
    ["button", "a", "summary", "label", "th", "td"].includes(tagName) ||
    /^h[1-6]$/.test(tagName) ||
    /button|link|menuitem|tab|checkbox|radio|switch|option|cell|row|heading/.test(role)
  );
}

function getAssociatedControlLabel(element: HTMLElement): string {
  if (!(isHtmlInputElement(element) || isHtmlSelectElement(element) || isHtmlTextAreaElement(element))) {
    return "";
  }

  const labels = Array.from(element.labels ?? [])
    .map((label) => getElementVisibleText(label, 120))
    .filter(Boolean);
  return cleanDomText(labels.join(" "));
}

function inferElementHrefLabel(element: HTMLElement): string {
  const href = isHtmlAnchorElement(element)
    ? element.href
    : element.closest<HTMLAnchorElement>("a[href]")?.href;
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, window.location.href);
    const segments = url.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment.trim()))
      .filter(Boolean)
      .filter((segment) => !/^[:\d]+$/.test(segment) && !/^[a-f0-9-]{8,}$/i.test(segment));
    const segment = segments.at(-1) ?? (url.pathname === "/" ? "home" : "");
    return humanizeIdentifier(segment);
  } catch {
    return "";
  }
}

function shouldInferDescendantIconLabel(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  return (
    ["button", "a", "summary", "label"].includes(tagName) ||
    /button|link|menuitem|tab|checkbox|radio|switch|option/.test(role) ||
    element.hasAttribute("onclick") ||
    Boolean(element.onclick) ||
    element.tabIndex >= 0
  );
}

function inferElementIconLabel(
  element: HTMLElement,
  options: { includeDescendants?: boolean } = {}
): string {
  const iconName = inferElementIconName(element, options);
  if (!iconName) {
    return "";
  }

  const semanticLabels: Record<string, string> = {
    bell: "notifications",
    "bell-ring": "notifications",
    "bell-dot": "notifications",
    "bell-plus": "notifications",
    "bell-off": "notifications",
    home: "home",
    house: "home",
    user: "profile",
    users: "users",
    "circle-help": "help",
    "help-circle": "help",
    question: "help",
    settings: "settings",
    cog: "settings",
    search: "search",
    plus: "add",
    "plus-circle": "add",
    x: "close",
    close: "close",
    edit: "edit",
    pencil: "edit",
    pen: "edit",
    "pen-line": "edit",
    "more-horizontal": "options",
    "more-vertical": "options",
    ellipsis: "options",
    menu: "menu",
    "arrow-left": "left",
    "arrow-right": "right",
    "arrow-up": "up",
    "arrow-down": "down",
    "chevron-left": "left",
    "chevron-right": "right",
    "chevron-up": "up",
    "chevron-down": "down"
  };

  return semanticLabels[iconName] ?? humanizeIdentifier(iconName);
}

function inferElementIconName(
  element: HTMLElement,
  options: { includeDescendants?: boolean } = {}
): string | undefined {
  const iconSourceElements = [
    element,
    ...(options.includeDescendants
      ? Array.from(iterateHtmlDescendants(element, 96)).filter((candidate) =>
          candidate.matches("svg,img,[class],[data-icon],[data-lucide]")
        )
      : [])
  ].slice(0, 12);
  for (const candidate of iconSourceElements) {
    const attributeIcon = [
      candidate.getAttribute("data-icon"),
      candidate.getAttribute("data-lucide"),
      candidate.getAttribute("icon"),
      candidate.getAttribute("name"),
      candidate.getAttribute("aria-label"),
      candidate.getAttribute("title"),
      isHtmlImageElement(candidate)
        ? candidate.getAttribute("src")?.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "")
        : undefined
    ]
      .map(normalizeIconName)
      .find(Boolean);
    if (attributeIcon) {
      return attributeIcon;
    }

    for (const className of Array.from(candidate.classList)) {
      const classIcon = normalizeIconClassToken(className);
      if (classIcon) {
        return classIcon;
      }
    }

    const useHref = isSvgUseElement(candidate)
      ? candidate.href.baseVal
      : candidate.querySelector<SVGUseElement>("use")?.href.baseVal;
    const useIcon = normalizeIconName(useHref?.split("#").at(-1));
    if (useIcon) {
      return useIcon;
    }

    if (isSvgElement(candidate) || candidate.querySelector("svg")) {
      const pathIcon = inferIconNameFromSvgPaths(candidate);
      if (pathIcon) {
        return pathIcon;
      }
    }
  }

  return undefined;
}

function normalizeIconClassToken(className: string): string | undefined {
  const normalized = className.trim().toLowerCase();
  const prefixed = normalized.match(/(?:^|[-_])(bell(?:[-_](?:ring|dot|plus|off))?|home|house|user|users|circle-help|help-circle|question|settings|cog|search|plus-circle|plus|x|close|edit|pencil|pen(?:[-_]line)?|more[-_](?:horizontal|vertical)|ellipsis|menu|arrow[-_](?:left|right|up|down)|chevron[-_](?:left|right|up|down))(?:$|[-_])/);
  if (prefixed?.[1]) {
    return normalizeIconName(prefixed[1]);
  }

  return normalizeIconName(normalized);
}

function normalizeIconName(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/^#/, "")
    .replace(/^(lucide|icon|icons|tabler|heroicons|hero|fa|fas|far|material|mdi)[-_:/]*/i, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s:/.]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  if (!normalized || /^(svg|path|icon|lucide|outline|solid)$/.test(normalized)) {
    return undefined;
  }

  const knownIcon = normalized.match(/(?:^|-)(bell(?:-(?:ring|dot|plus|off))?|home|house|user|users|circle-help|help-circle|question|settings|cog|search|plus-circle|plus|x|close|edit|pencil|pen(?:-line)?|more-(?:horizontal|vertical)|ellipsis|menu|arrow-(?:left|right|up|down)|chevron-(?:left|right|up|down))$/);
  return knownIcon?.[1];
}

function inferIconNameFromSvgPaths(element: Element): string | undefined {
  const pathText = Array.from(element.querySelectorAll("path,circle,polyline,line"))
    .map((node) =>
      [
        node.getAttribute("d"),
        node.getAttribute("points"),
        node.getAttribute("cx"),
        node.getAttribute("cy"),
        node.getAttribute("r"),
        node.getAttribute("x1"),
        node.getAttribute("x2"),
        node.getAttribute("y1"),
        node.getAttribute("y2")
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ")
    .replace(/[,\s]+/g, " ")
    .toLowerCase();
  if (!pathText) {
    return undefined;
  }

  if (
    /bell|notification/i.test(pathText) ||
    (/(?:17h16|h-16|15\.326|17\.082|v-3a7|v3a4)/.test(pathText) &&
      /(?:10\.268 21a2|m9 17v1a3|a6 6 0 0 0 6 8|18 8a6|18\.75 8\.25a6\.75)/.test(pathText)) ||
    (/(?:a6|a7|a6\.75)\s+(?:6|7|6\.75)\s+0\s+0\s+[01]/.test(pathText) &&
      /(?:h16|h-16|v3|v-3|15\.326|17\.082)/.test(pathText))
  ) {
    return "bell";
  }
  if (/m3 9l9-7 9 7|m10 20v-6h4v6|house|home/i.test(pathText)) {
    return "home";
  }
  if (/m20 21v-2a4 4 0 0 0-4-4h-8a4 4|user/i.test(pathText)) {
    return "user";
  }
  if (/m9\.09 9a3 3 0 1 1 5\.83 1c0 2-3 3-3 3|circle help|help/i.test(pathText)) {
    return "circle-help";
  }

  return undefined;
}

function humanizeIdentifier(value: string): string {
  return cleanDomText(value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toLowerCase()));
}

function cleanDomText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function sanitizeHref(element: HTMLElement): string | undefined {
  if (!isHtmlAnchorElement(element) || !element.href) {
    return undefined;
  }

  try {
    const url = new URL(element.href);
    return `${url.pathname}${url.search}`.slice(0, 240);
  } catch {
    return undefined;
  }
}

function getCurrentRoute(): string {
  return getRuntimeRoute(window.location.pathname, window.location.search, window.location.hash);
}

function findDomTargetCenter(snapshot: DomSnapshot, elementId: string) {
  const element = snapshot.uiFacts.find((candidate) => candidate.id === elementId);
  if (!element) {
    return null;
  }

  return {
    x: element.rect.x + element.rect.width / 2,
    y: element.rect.y + element.rect.height / 2
  };
}

function findCleanDomElementById(elements: DomElementSnapshot[], elementId: string): DomElementSnapshot | null {
  for (const element of elements) {
    if (element.id === elementId) {
      return element;
    }

    const childMatch = element.children ? findCleanDomElementById(element.children, elementId) : null;
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function findCleanDomElementCenter(element: DomElementSnapshot) {
  if (!isPointableCleanDomElement(element)) {
    return null;
  }

  return {
    x: element.rect.x + element.rect.width / 2,
    y: element.rect.y + element.rect.height / 2
  };
}

function isPointableCleanDomElement(element: DomElementSnapshot): boolean {
  if (element.state?.ancestorHidden === true) {
    return false;
  }

  if (element.visibility !== "visible" && element.visibility !== "partially_visible") {
    return false;
  }

  if (element.rect.width < 1 || element.rect.height < 1) {
    return false;
  }

  return true;
}

function findLiveDomTargetCenter(pageContext: PageContext, elementId: string) {
  const element = pageContext.targetElements.get(elementId);
  if (!element) {
    return null;
  }

  const pointElement = findPreferredLivePointableElement(element);
  if (hasHiddenAncestorForScrolling(pointElement)) {
    return null;
  }

  const rect = getElementViewportRect(pointElement);
  if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
    return null;
  }

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function findPreferredLivePointableElement(element: HTMLElement): HTMLElement {
  return findPreferredPointableAncestor(element, {
    isPointable: isInteractiveDomElement,
    shouldIgnore: isBarkanWidgetElement,
    maxDepth: 6
  });
}

async function waitForStableLayout(options: { retry?: boolean } = {}) {
  try {
    if (!options.retry && document.fonts?.status !== "loaded") {
      await Promise.race([document.fonts?.ready, wait(DOM_CAPTURE_FONT_SETTLE_TIMEOUT_MS)]);
    }
  } catch {
  }

  await waitForDomCaptureSettle(options);
  await nextAnimationFrame();
}

async function waitForDomCaptureSettle(options: { retry?: boolean } = {}): Promise<void> {
  const startedAt = performance.now();
  const mutationTracker = createDomMutationTracker();
  let activeRoute = getCurrentRoute();
  let routeStartedAt = startedAt;
  let routeChanged = false;
  let lastSignature = "";
  let lastMutationCount = 0;
  let stableSamples = 0;
  const bootingAtStart = !options.retry && isDomCaptureReadinessPending();
  const timeoutMs = options.retry
    ? Math.min(220, DOM_CAPTURE_ROUTE_SETTLE_TIMEOUT_MS)
    : bootingAtStart
      ? DOM_CAPTURE_BOOTING_SETTLE_TIMEOUT_MS
      : DOM_CAPTURE_ROUTE_SETTLE_TIMEOUT_MS;
  const minMs = options.retry
    ? 0
    : bootingAtStart
      ? DOM_CAPTURE_BOOTING_SETTLE_MIN_MS
      : DOM_CAPTURE_ROUTE_SETTLE_MIN_MS;
  const mutationQuietMs = options.retry
    ? 0
    : bootingAtStart
      ? DOM_CAPTURE_BOOTING_MUTATION_QUIET_MS
      : DOM_CAPTURE_MUTATION_QUIET_MS;
  const requiredStableSamples = bootingAtStart
    ? DOM_CAPTURE_BOOTING_STABLE_SAMPLES
    : DOM_CAPTURE_ROUTE_SETTLE_STABLE_SAMPLES;

  try {
    while (performance.now() - startedAt < timeoutMs) {
      await nextAnimationFrame();

      const now = performance.now();
      const currentRoute = getCurrentRoute();
      if (currentRoute !== activeRoute) {
        activeRoute = currentRoute;
        routeStartedAt = now;
        routeChanged = true;
        lastSignature = "";
        stableSamples = 0;
      }

      const signature = buildDomCaptureSettleSignature(activeRoute);
      const mutationCountChanged = mutationTracker.count !== lastMutationCount;
      if (mutationCountChanged) {
        lastMutationCount = mutationTracker.count;
        stableSamples = 0;
      }

      if (signature === lastSignature) {
        stableSamples += 1;
      } else {
        lastSignature = signature;
        stableSamples = 0;
      }

      const elapsed = now - startedAt;
      const routeElapsed = now - routeStartedAt;
      const routeGraceMs = routeChanged && !options.retry ? DOM_CAPTURE_ROUTE_MISMATCH_GRACE_MS : 0;
      const mutationIsQuiet =
        mutationTracker.lastMutationAt === 0 || now - mutationTracker.lastMutationAt >= mutationQuietMs;
      const visualMotionIsQuiet = options.retry || !hasActivePageDomAnimation();
      const readinessSettled =
        options.retry ||
        !bootingAtStart ||
        !isDomCaptureReadinessPending() ||
        elapsed >= DOM_CAPTURE_BOOTING_READINESS_MAX_WAIT_MS;
      if (
        stableSamples >= requiredStableSamples &&
        elapsed >= minMs &&
        routeElapsed >= routeGraceMs &&
        mutationIsQuiet &&
        visualMotionIsQuiet &&
        readinessSettled
      ) {
        return;
      }

      await wait(DOM_CAPTURE_ROUTE_SETTLE_INTERVAL_MS);
    }
  } finally {
    mutationTracker.disconnect();
  }
}

function hasActivePageDomAnimation(): boolean {
  if (typeof document.documentElement.getAnimations !== "function") {
    return false;
  }

  return document.documentElement.getAnimations({ subtree: true }).some((animation) => {
    const playState = String(animation.playState);
    if (playState !== "running" && playState !== "pending") {
      return false;
    }

    const target =
      typeof KeyframeEffect !== "undefined" && animation.effect instanceof KeyframeEffect
        ? animation.effect.target
        : null;
    if (!isHtmlElement(target) || isBarkanWidgetElement(target) || !isVisibleDomReadinessElement(target)) {
      return false;
    }

    return true;
  });
}

function isDomCaptureReadinessPending(): boolean {
  if (document.readyState === "loading") {
    return true;
  }

  if (hasVisibleDomLoadingIndicator()) {
    return true;
  }

  if (document.readyState !== "complete") {
    const body = document.body;
    const bodyChildCount = body?.childElementCount ?? 0;
    const bodyTextLength = (body?.textContent ?? "").replace(/\s+/g, "").length;
    return bodyChildCount <= 3 && bodyTextLength < 80 && countPrimaryDomControlsFast() === 0;
  }

  return false;
}

function hasVisibleDomLoadingIndicator(): boolean {
  const loadingIndicators = document.querySelectorAll<HTMLElement>(
    [
      '[aria-busy="true"]',
      '[role="progressbar"]',
      '[data-loading="true"]',
      '[data-state="loading"]',
      ".loading",
      ".spinner",
      ".skeleton",
      '[class*="spinner"]',
      '[class*="skeleton"]'
    ].join(",")
  );

  for (const element of Array.from(loadingIndicators).slice(0, 16)) {
    if (isBarkanWidgetElement(element) || !isVisibleDomReadinessElement(element)) {
      continue;
    }

    return true;
  }

  return false;
}

function isVisibleDomReadinessElement(element: HTMLElement): boolean {
  const rect = getElementViewportRect(element);
  if (rect.width < 4 || rect.height < 4 || rect.bottom <= 0 || rect.right <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

async function waitForGuidanceClickDomSettle(beforeClickSignature: string): Promise<void> {
  const startedAt = performance.now();
  const mutationTracker = createDomMutationTracker();
  let lastSignature = beforeClickSignature;
  let lastMutationCount = 0;
  let stableSamples = 0;

  try {
    while (performance.now() - startedAt < GUIDANCE_CLICK_DOM_SETTLE_TIMEOUT_MS) {
      await nextAnimationFrame();

      const now = performance.now();
      const elapsed = now - startedAt;
      const signature = buildDomCaptureSettleSignature(getCurrentRoute());
      const changedSinceClick = signature !== beforeClickSignature || mutationTracker.count > 0;
      const mutationCountChanged = mutationTracker.count !== lastMutationCount;
      if (mutationCountChanged) {
        lastMutationCount = mutationTracker.count;
        stableSamples = 0;
      }

      if (signature === lastSignature) {
        stableSamples += 1;
      } else {
        lastSignature = signature;
        stableSamples = 0;
      }

      const mutationIsQuiet =
        mutationTracker.lastMutationAt === 0 || now - mutationTracker.lastMutationAt >= GUIDANCE_CLICK_DOM_SETTLE_QUIET_MS;
      if (
        changedSinceClick &&
        elapsed >= GUIDANCE_CLICK_DOM_SETTLE_MIN_MS &&
        stableSamples >= DOM_CAPTURE_ROUTE_SETTLE_STABLE_SAMPLES &&
        mutationIsQuiet
      ) {
        return;
      }

      if (!changedSinceClick && elapsed >= GUIDANCE_CLICK_DOM_FIRST_CHANGE_WAIT_MS) {
        return;
      }

      await wait(DOM_CAPTURE_ROUTE_SETTLE_INTERVAL_MS);
    }
  } finally {
    mutationTracker.disconnect();
  }
}

function createDomMutationTracker(): { count: number; lastMutationAt: number; disconnect: () => void } {
  if (typeof MutationObserver === "undefined" || !document.documentElement) {
    return { count: 0, lastMutationAt: 0, disconnect: () => undefined };
  }

  const tracker = {
    count: 0,
    lastMutationAt: 0,
    disconnect: () => observer.disconnect()
  };
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some(isMeaningfulDomSettleMutation)) {
      return;
    }

    tracker.count += 1;
    tracker.lastMutationAt = performance.now();
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeFilter: [
      "class",
      "style",
      "hidden",
      "open",
      "role",
      "aria-hidden",
      "aria-expanded",
      "aria-selected",
      "aria-modal",
      "aria-busy",
      "data-state",
      "data-open"
    ]
  });

  return tracker;
}

function isMeaningfulDomSettleMutation(mutation: MutationRecord): boolean {
  if (isIgnoredDomSettleMutationNode(mutation.target)) {
    return false;
  }

  if (mutation.type !== "childList") {
    return true;
  }

  const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
  return changedNodes.length === 0 || changedNodes.some((node) => !isIgnoredDomSettleMutationNode(node));
}

function isIgnoredDomSettleMutationNode(node: Node): boolean {
  const element =
    isHtmlElement(node) ? node : isHtmlElement(node.parentElement) ? node.parentElement : null;
  return !element || isBarkanWidgetElement(element);
}

function buildDomCaptureSettleSignature(route: string): string {
  const main = document.querySelector<HTMLElement>("main,[role='main']");
  const mainRect = main ? getElementViewportRect(main) : undefined;
  return [
    route,
    document.title,
    document.body?.childElementCount ?? 0,
    main?.childElementCount ?? 0,
    Math.round(document.body?.scrollHeight ?? 0),
    Math.round(mainRect?.width ?? 0),
    Math.round(mainRect?.height ?? 0)
  ].join("::");
}

function isDomSnapshotProbablyStale(snapshot: DomSnapshot): boolean {
  return isSnapshotStaleForRouteContent(snapshot, {
    livePrimaryControlCount: countPrimaryDomControlsFast()
  });
}

function countPrimaryDomControlsFast(): number {
  return document.querySelectorAll(
    "button,a,input,select,textarea,summary,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='textbox'],[role='combobox'],[role='searchbox']"
  ).length;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForScrollSettle(target: Window | HTMLElement, direction: "up" | "down") {
  let previousPosition = getScrollPosition(target);
  const startedAt = performance.now();

  while (performance.now() - startedAt < 900) {
    await wait(80);
    const nextPosition = getScrollPosition(target);
    const moved = direction === "down" ? nextPosition > previousPosition : nextPosition < previousPosition;
    const changed = Math.abs(nextPosition - previousPosition) > 1;
    previousPosition = nextPosition;

    if (!changed && !moved) {
      break;
    }
  }

  await waitForStableLayout();
}

async function waitForElementScrollSettle(element: HTMLElement, previousTop: number) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < 1000) {
    await wait(80);
    const nextTop = getElementViewportRect(element).top;
    const changed = Math.abs(nextTop - previousTop) > 1;
    previousTop = nextTop;
    if (!changed) {
      break;
    }
  }

  await waitForStableLayout();
}

function getScrollPosition(target: Window | HTMLElement): number {
  return target instanceof Window ? target.scrollY : target.scrollTop;
}

function downscaleCanvas(source: HTMLCanvasElement, maxWidth: number) {
  if (source.width <= maxWidth) {
    return source;
  }

  const scale = maxWidth / source.width;
  const output = document.createElement("canvas");
  output.width = Math.round(source.width * scale);
  output.height = Math.round(source.height * scale);
  output.getContext("2d")?.drawImage(source, 0, 0, output.width, output.height);
  return output;
}

function normalizeAudioLevel(input: Float32Array): number {
  let sum = 0;
  for (const sample of input) {
    sum += sample * sample;
  }

  const rms = Math.sqrt(sum / Math.max(1, input.length));
  return Math.max(0, Math.min(1, (rms - 0.01) / 0.11));
}

function normalizeAudioBands(input: Float32Array, bandCount: number): number[] {
  const bandSize = Math.max(1, Math.floor(input.length / bandCount));
  const bands: number[] = [];

  for (let bandIndex = 0; bandIndex < bandCount; bandIndex++) {
    const start = bandIndex * bandSize;
    const end = bandIndex === bandCount - 1 ? input.length : Math.min(input.length, start + bandSize);
    let sum = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      const sample = input[sampleIndex] ?? 0;
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / Math.max(1, end - start));
    bands.push(Math.max(0, Math.min(1, (rms - 0.008) / 0.105)));
  }

  return bands;
}

function downsampleToPcm16(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Int16Array {
  if (outputSampleRate === inputSampleRate) {
    return floatToPcm16(input);
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex++) {
    const inputIndex = Math.floor(outputIndex * ratio);
    output[outputIndex] = input[inputIndex] ?? 0;
  }

  return floatToPcm16(output);
}

function floatToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index++) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function createSilencePcmBase64(sampleRate: number, durationMilliseconds: number): string {
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMilliseconds) / 1000));
  return bytesToBase64(new Uint8Array(sampleCount * 2));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeTranscript(transcript: string): string {
  return normalizeSpeechForComparison(transcript);
}

function areSimilarUserTranscripts(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if ((left.length >= 18 && right.includes(left)) || (right.length >= 18 && left.includes(right))) {
    return true;
  }

  const leftTokens = speechTokens(left);
  const rightTokens = speechTokens(right);
  if (leftTokens.length < 3 || rightTokens.length < 3) {
    return false;
  }

  const overlap = countTokenOverlap(leftTokens, rightTokens);
  const containment = overlap / Math.max(1, Math.min(leftTokens.length, rightTokens.length));
  const dice = (2 * overlap) / Math.max(1, leftTokens.length + rightTokens.length);
  return containment >= 0.86 || (containment >= 0.74 && dice >= 0.7);
}

function isLikelyUserBargeInTranscript(transcript: string): boolean {
  const tokens = speechTokens(transcript);
  if (tokens.length >= 3) {
    return true;
  }

  return /^(stop|wait|pause|no|barkan|hey barkan|listen|actually)\b/i.test(transcript.trim());
}

function isLikelyAssistantEcho(transcript: string, assistantSamples: string[]): boolean {
  const transcriptText = normalizeSpeechForComparison(transcript);
  const transcriptTokens = speechTokens(transcript);
  if (transcriptTokens.length < 3 || !transcriptText) {
    return false;
  }

  for (const sample of assistantSamples) {
    const sampleText = normalizeSpeechForComparison(sample);
    const sampleTokens = speechTokens(sample);
    if (sampleTokens.length < 3 || !sampleText) {
      continue;
    }

    if (transcriptText.length >= 14 && sampleText.includes(transcriptText)) {
      return true;
    }

    if (sampleText.length >= 14 && transcriptText.includes(sampleText)) {
      return true;
    }

    const overlap = countTokenOverlap(transcriptTokens, sampleTokens);
    const containment = overlap / Math.max(1, Math.min(transcriptTokens.length, sampleTokens.length));
    const dice = (2 * overlap) / Math.max(1, transcriptTokens.length + sampleTokens.length);
    if (containment >= 0.78 || (containment >= 0.68 && dice >= 0.62)) {
      return true;
    }
  }

  return false;
}

function speechTokens(text: string): string[] {
  const stopWords = new Set(["a", "an", "and", "are", "i", "it", "is", "of", "on", "that", "the", "this", "to", "you"]);
  return normalizeSpeechForComparison(text)
    .split(" ")
    .map((token) => token.trim())
    .map(normalizeSearchToken)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function normalizeSpeechForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countTokenOverlap(leftTokens: string[], rightTokens: string[]): number {
  const rightCounts = new Map<string, number>();
  for (const token of rightTokens) {
    rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of leftTokens) {
    const count = rightCounts.get(token) ?? 0;
    if (count <= 0) {
      continue;
    }

    overlap++;
    rightCounts.set(token, count - 1);
  }

  return overlap;
}

function pickBarkanGreeting(): string {
  const greetings = [
    "Hi, I'm Barkan. How can I help you today?",
    "Hi, I'm Barkan. What can I help with?",
    "Hi, I'm Barkan. Tell me what you need.",
    "Hi, I'm Barkan. How can I help?"
  ];
  return greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0];
}

function buildOpenAIUserPrompt(turn: CommittedTurn): string {
  const originalPrompt =
    turn.answeredQuestions && turn.historyTranscript && turn.historyTranscript !== turn.transcript
      ? `original visitor request:\n${turn.historyTranscript}\n\n`
      : "";
  const basePrompt = turn.answeredQuestions
    ? `The visitor answered the clarification questions below. This is the answer to your previous ask_user question. Continue the original request now using these answers. Do not ask_user, ask another clarification, or ask another dummy/test question in this response. If something is still ambiguous, choose the safest visible/current option or tell the visitor what to click/type.\n\n${originalPrompt}clarification answers:\n${turn.transcript}`
    : turn.transcript;

  if (turn.scrollRetryCount === 0) {
    return basePrompt;
  }

  return `${basePrompt}

internal note: barkan already performed one smooth scroll for this request. use the new viewport now; do not emit another scroll action.`;
}

function buildRealtimeSttUrl(token: string): string {
  const params = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    token,
    audio_format: `pcm_${REALTIME_STT_SAMPLE_RATE}`,
    language_code: "en",
    commit_strategy: "vad",
    vad_silence_threshold_secs: "1.1",
    vad_threshold: "0.35",
    min_speech_duration_ms: "100",
    min_silence_duration_ms: "100",
    include_language_detection: "false"
  });
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
}

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("websocket timeout")), 8000);
    socket.addEventListener(
      "open",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeoutId);
        reject(new Error("websocket failed"));
      },
      { once: true }
    );
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeWidgetApiBaseUrl(apiBaseUrl: string, pageProtocol = getCurrentPageProtocol()): string {
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    return apiBaseUrl;
  }

  if (url.port === "4888") {
    url.port = "4001";
  }
  if (pageProtocol === "https:" && url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("Barkan API URL must use HTTPS on HTTPS pages.");
  }

  return url.origin;
}

function getCurrentPageProtocol(): string {
  return typeof window !== "undefined" ? window.location.protocol : "";
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function mergeTransition(currentTransition: string, addedTransition: string): string {
  const trimmedTransition = currentTransition.trim();
  if (!trimmedTransition || trimmedTransition === "none" || trimmedTransition === "all 0s ease 0s") {
    return addedTransition;
  }

  const firstAddedProperty = addedTransition.split(/\s+/)[0] ?? "";
  if (firstAddedProperty && trimmedTransition.includes(firstAddedProperty)) {
    return trimmedTransition;
  }

  return `${trimmedTransition}, ${addedTransition}`;
}

function normalizeNavigationRoute(route: string): string | null {
  const trimmedRoute = route.trim();
  if (!trimmedRoute || /^https?:\/\//i.test(trimmedRoute)) {
    return null;
  }

  return trimmedRoute.startsWith("/") ? trimmedRoute : `/${trimmedRoute}`;
}

function recordGlobalDebugEvent(name: string, detail?: string) {
  const events = [
    ...(window.__BARKAN_DEBUG__?.events ?? []),
    { name, detail, at: Math.round(performance.now()) }
  ].slice(-20);
  window.__BARKAN_DEBUG__ = {
    ...(window.__BARKAN_DEBUG__ ?? {}),
    events,
    ...(name === "end-call" ? { lastEndReason: detail ?? name } : {})
  };
}

function recordLatencyLog(label: string, startedAt: number, details?: Record<string, unknown>) {
  const entry: BarkanLatencyLogEntry = {
    label,
    elapsedMs: Math.round(performance.now() - startedAt),
    at: Math.round(performance.now()),
    ...(details ? { details } : {})
  };
  const latencyLogs = [...(window.__BARKAN_DEBUG__?.latencyLogs ?? []), entry].slice(-80);
  window.__BARKAN_DEBUG__ = {
    ...(window.__BARKAN_DEBUG__ ?? {}),
    latencyLogs,
    lastTimings: {
      ...(window.__BARKAN_DEBUG__?.lastTimings ?? {}),
      [`latency:${label}`]: entry.elapsedMs
    }
  };
  console.info(`[Barkan latency] ${label}`, entry);
}

function countDomSnapshotElements(elements: DomElementSnapshot[]): number {
  return elements.reduce((count, element) => count + 1 + countDomSnapshotElements(element.children ?? []), 0);
}

async function hasGrantedMicrophonePermission(): Promise<boolean> {
  try {
    const permissionStatus = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return permissionStatus?.state === "granted";
  } catch {
    return false;
  }
}

const currentScript =
  typeof document === "undefined"
    ? null
    : document.currentScript instanceof HTMLScriptElement
      ? document.currentScript
      : Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-barkan-site]")).at(-1);

if (currentScript?.dataset.barkanSite) {
  void new BarkanWidget(currentScript).start();
}
