export type DomElementVisibility = "visible" | "partially_visible" | "above" | "below" | "outside";

export interface DomElementSnapshot {
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

export type UiFactKind = "button" | "link" | "input" | "heading" | "modal" | "menu" | "table" | "text";

export interface UiFactMetadata {
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

export interface UiFact {
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

export interface ScrollSurface {
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

export interface PageMeta {
  title?: string;
  route: string;
  headings: string[];
  landmarks: string[];
  selectedNav: string[];
  activeDialog?: string;
  focusedFactId?: string;
}

export interface ActiveSurface {
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

export interface DomSnapshotMarkers {
  selectedLabels: string[];
  visibleHeadings: string[];
  primaryActions: string[];
  collectionHints: string[];
  activeSurfaceLabels: string[];
  transientLabels: string[];
}

export interface ContentBlock {
  id: string;
  heading?: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  nearbyFactIds: string[];
}

export interface FormSummary {
  id: string;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
  fieldIds: string[];
  submitIds: string[];
  validationMessages: string[];
}

export interface DomRelationship {
  kind: "label_for" | "described_by" | "controls" | "form_field" | "form_submit" | "owns";
  from: string;
  to: string;
  label?: string;
}

export interface DomSnapshot {
  captureVersion?: string;
  route: string;
  viewportWidth: number;
  viewportHeight: number;
  title?: string;
  elements: DomElementSnapshot[];
  uiFacts?: UiFact[];
  offscreenUiFacts?: UiFact[];
  scrollSurfaces: ScrollSurface[];
  activeSurfaces?: ActiveSurface[];
  markers?: DomSnapshotMarkers;
  contentBlocks?: ContentBlock[];
  forms?: FormSummary[];
  relationships?: DomRelationship[];
  pageMeta?: PageMeta;
}
