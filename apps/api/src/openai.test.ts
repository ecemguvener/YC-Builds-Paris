import { describe, expect, it } from "vitest";
import { buildOpenAIRequestBody } from "./openai.js";
import type { AppConfig } from "./config.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 4000,
  PUBLIC_APP_URL: "http://localhost:5173",
  PUBLIC_API_URL: "http://localhost:4000",
  MONGODB_URI: "mongodb://localhost/test",
  SESSION_COOKIE_NAME: "barkan_session",
  SESSION_SECRET: "test-secret-test-secret",
  ELEVENLABS_API_KEY: "eleven",
  ELEVENLABS_VOICE_ID: "voice",
  OPENAI_API_KEY: "openai",
  OPENAI_WIDGET_MODEL: "gpt-5.4-2026-03-05",
  OPENAI_ACTION_MODEL: "gpt-5.4-2026-03-05",
  OPENAI_ATLAS_MODEL: "gpt-5.4-2026-03-05"
};

describe("OpenAI request body", () => {
  it("sends the cleaned DOM tree as the active context", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "where can i open help?",
      domSnapshot: createDomSnapshot(),
      siteRouteMap: {
        version: 1,
        project_id: "proj_test",
        generated_at: "2026-05-19T00:00:00.000Z",
        source_files: ["src/routes.tsx"],
        routes: [{ path: "/settings/billing", summary: "Billing settings and invoices." }]
      }
    });

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("current route: /dashboard");
    expect(serialized).toContain("cleaned DOM tree");
    expect(serialized).toContain("current visible element index");
    expect(serialized).toContain("page action map");
    expect(serialized).toContain("every element has an id like u12 or c12");
    expect(serialized).toContain("this normal widget mode only guides the visitor");
    expect(serialized).toContain("never claim you can perform page actions for them");
    expect(serialized).toContain("do not say \\\"i can turn off\\\"");
    expect(serialized).toContain("then i can show you");
    expect(serialized).toContain("never invent interaction mechanics");
    expect(serialized).toContain("[NEED_FURTHER_ACTION:true]");
    expect(serialized).toContain("[NEED_FURTHER_ACTION:false]");
    expect(serialized).toContain("recommend drag/drop only when the DOM explicitly exposes draggable");
    expect(serialized).toContain("the cleaned DOM tree represents the active rendered view");
    expect(serialized).toContain("closed or hidden sections, tabs, panels, accordions, menus, and pages are intentionally omitted");
    expect(serialized).toContain("if a requested control, answer, or item is not listed in the current DOM");
    expect(serialized).toContain("visible opener");
    expect(serialized).toContain("use previous-step context when an explicit continuation context is provided");
    expect(serialized).toContain("previous DOM snapshots from earlier turns are stale");
    expect(serialized).toContain("never answer with alternatives");
    expect(serialized).toContain("choose the single best visible opener");
    expect(serialized).toContain("then i can point");
    expect(serialized).toContain("emit [NEED_FURTHER_ACTION:true]");
    expect(serialized).toContain("normal widget guidance cannot execute page actions");
    expect(serialized).toContain("say \\\"show you where to...\\\" or \\\"tap/click this...\\\"");
    expect(serialized).toContain("generic action controls such as new, add, create, plus, +, save, or delete can be scoped");
    expect(serialized).toContain("point the requested category tab/selector first");
    expect(serialized).toContain("if x has a visible unselected tab/selector");
    expect(serialized).toContain("open this category first, then i can show you new");
    expect(serialized).toContain("open this section first, then i can show you the requested item");
    expect(serialized).toContain("[SCROLLTO:c21:requested item][NEED_FURTHER_ACTION:true]");
    expect(serialized).toContain("[SCROLLTO] scrolls and points to the element in one step");
    expect(serialized).toContain("spoken answer must not ask the visitor to scroll manually");
    expect(serialized).not.toContain("scroll to this account item");
    expect(serialized).not.toContain("scroll to this item, then open it");
    expect(serialized).toContain("the first directive must point or scroll to the currently available matching element");
    expect(serialized).toContain("the first tag must be [POINTELEMENT:...] or [SCROLLTO:...]");
    expect(serialized).toContain("multi-step guidance context");
    expect(serialized).toContain("for ordered targets such as first/second/last item");
    expect(serialized).toContain("[POINTELEMENT:element_id:short label]");
    expect(serialized).toContain("[SCROLLTO:element_id:short reason]");
    expect(serialized).toContain("c1");
    expect(serialized).toContain("help");
    expect(serialized).toContain("Centre d'aide");
    expect(serialized).toContain("helpcenter.svg");
    expect(serialized).not.toContain("visible UI facts");
    expect(serialized).not.toContain("recommended click targets");
    expect(serialized).not.toContain("/settings/billing");
    expect(serialized).not.toContain("screenshot");
  });

  it("threads widget turns with the previous Responses API response id", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "continue from my previous answer",
      previousResponseId: "resp_previous_123",
      domSnapshot: createDomSnapshot()
    });

    expect(body.previous_response_id).toBe("resp_previous_123");
  });

  it("returns question answers as the ask_user tool output when the call id is available", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "1. What priority?\nAnswer: medium",
      previousResponseId: "resp_previous_123",
      questionToolCallId: "call_question_123",
      domSnapshot: createDomSnapshot()
    });

    const input = body.input as Array<Record<string, unknown>>;
    expect(input[0]).toMatchObject({
      type: "function_call_output",
      call_id: "call_question_123",
      output: "1. What priority?\nAnswer: medium"
    });
    expect(input[1]).toMatchObject({ role: "user" });
  });

  it("can suppress follow-up ask_user calls after a clarification answer", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "1. What priority?\nAnswer: medium",
      previousResponseId: "resp_previous_123",
      questionToolCallId: "call_question_123",
      suppressFurtherQuestions: true,
      domSnapshot: createDomSnapshot()
    });

    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(JSON.stringify(body.input)).toContain("function_call_output");
  });

  it("keeps visible controls in the compact index even when the full DOM tree is truncated", () => {
    const fillerText = "x".repeat(70_000);
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "open participants",
      domSnapshot: {
        ...createDomSnapshot(),
        elements: [
          {
            id: "c1",
            tag: "div",
            label: fillerText,
            rect: { x: 0, y: 0, width: 1, height: 1 },
            visibility: "visible" as const,
            interactive: false
          },
          {
            id: "c341",
            tag: "button",
            label: "Participants",
            attributes: {
              id: "participants"
            },
            rect: { x: 907, y: 20, width: 60, height: 49 },
            visibility: "visible" as const,
            interactive: true
          }
        ]
      }
    });

    const promptText = JSON.stringify(body);
    const interactiveIndexStart = promptText.indexOf("current visible element index");
    const domTreeStart = promptText.lastIndexOf("cleaned DOM tree");

    expect(interactiveIndexStart).toBeGreaterThan(-1);
    expect(domTreeStart).toBeGreaterThan(interactiveIndexStart);
    expect(promptText.slice(interactiveIndexStart, domTreeStart)).toContain("c341");
    expect(promptText.slice(interactiveIndexStart, domTreeStart)).toContain("Participants");
  });

  it("keeps independently captured visible controls even when tree pruning loses the concrete button", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "i still don't see a visible create api key control",
      domSnapshot: {
        ...createDomSnapshot(),
        route: "/home",
        elements: [
          {
            id: "c1",
            tag: "span",
            text: "Home 24h 7d 30d 90d Create API key Total tokens",
            rect: { x: 219, y: 55, width: 1693, height: 968 },
            visibility: "visible" as const,
            interactive: false
          }
        ],
        uiFacts: [
          {
            id: "u1",
            kind: "button" as const,
            label: "Create API key",
            text: "Create API key",
            metadata: {
              tagName: "button",
              type: "button",
              iconName: "key"
            },
            state: {
              visible: true,
              disabled: false,
              selected: false,
              expanded: false,
              required: false
            },
            rect: { x: 1745, y: 78, width: 157, height: 40 }
          }
        ],
        offscreenUiFacts: []
      }
    });

    const promptText = JSON.stringify(body);
    const visibleIndexStart = promptText.lastIndexOf("current visible element index");
    const domTreeStart = promptText.lastIndexOf("cleaned DOM tree");
    const visibleIndex = promptText.slice(visibleIndexStart, domTreeStart);

    expect(visibleIndexStart).toBeGreaterThan(-1);
    expect(domTreeStart).toBeGreaterThan(visibleIndexStart);
    expect(visibleIndex).toContain("\\\"id\\\":\\\"u1\\\"");
    expect(visibleIndex).toContain("Create API key");
    expect(visibleIndex).toContain("visibleIndex");
  });

  it("builds an action map that keeps sidebar tab context for existing controls", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "invite members",
      domSnapshot: {
        ...createDomSnapshot(),
        route: "/settings/organization/general",
        pageMeta: {
          title: "Organization settings",
          route: "/settings/organization/general",
          headings: ["Organization settings", "Details"],
          landmarks: ["aside: Settings", "main: Organization settings"],
          selectedNav: ["General"]
        },
        uiFacts: [
          createUiFact("u1", "General", "Organization", { selected: true }),
          createUiFact("u2", "People", "Organization"),
          createUiFact("u3", "People", "Project")
        ],
        offscreenUiFacts: []
      }
    });

    const promptText = JSON.stringify(body);
    const actionMapStart = promptText.indexOf("page action map");
    const visibleIndexStart = promptText.lastIndexOf("current visible element index");
    const actionMap = promptText.slice(actionMapStart, visibleIndexStart);

    expect(actionMapStart).toBeGreaterThan(-1);
    expect(visibleIndexStart).toBeGreaterThan(actionMapStart);
    expect(actionMap).toContain("\\\"id\\\":\\\"u2\\\"");
    expect(actionMap).toContain("People");
    expect(actionMap).toContain("Organization");
    expect(actionMap).toContain("duplicateLabels");
    expect(actionMap).toContain("\\\"where\\\":\\\"Project\\\"");
  });

  it("adds generic intent aliases for common SaaS wording mismatches", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "invite a teammate and create an access token for invoices",
      domSnapshot: {
        ...createDomSnapshot(),
        route: "/settings",
        uiFacts: [
          createUiFact("u1", "People", "Organization"),
          createUiFact("u2", "API keys", "Organization"),
          createUiFact("u3", "Billing", "Organization")
        ],
        offscreenUiFacts: []
      }
    });

    const promptText = JSON.stringify(body);
    const actionMapStart = promptText.indexOf("page action map");
    const visibleIndexStart = promptText.lastIndexOf("current visible element index");
    const actionMap = promptText.slice(actionMapStart, visibleIndexStart);

    expect(actionMap).toContain("\\\"id\\\":\\\"u1\\\"");
    expect(actionMap).toContain("\\\"invite\\\"");
    expect(actionMap).toContain("\\\"members\\\"");
    expect(actionMap).toContain("\\\"id\\\":\\\"u2\\\"");
    expect(actionMap).toContain("\\\"token\\\"");
    expect(actionMap).toContain("\\\"credential\\\"");
    expect(actionMap).toContain("\\\"id\\\":\\\"u3\\\"");
    expect(actionMap).toContain("\\\"invoice\\\"");
    expect(actionMap).toContain("\\\"payment\\\"");
  });

  it("disambiguates repeated row/card actions with generic container context", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "edit the stripe webhook secret row",
      domSnapshot: {
        ...createDomSnapshot(),
        route: "/settings/secrets",
        pageMeta: {
          title: "Secrets",
          route: "/settings/secrets",
          headings: ["Secrets"],
          landmarks: ["main: Secrets"],
          selectedNav: ["Secrets"]
        },
        uiFacts: [
          createActionUiFact("u1", "Edit", {
            context: "Repository secrets",
            container: { kind: "row", label: "GitHub token", index: 1 }
          }),
          createActionUiFact("u2", "Edit", {
            context: "Repository secrets",
            container: { kind: "row", label: "Stripe webhook secret", index: 2 }
          }),
          createActionUiFact("u3", "More", {
            context: "Product cards",
            container: { kind: "card", label: "Summer linen shirt", index: 4 }
          })
        ],
        offscreenUiFacts: []
      }
    });

    const promptText = JSON.stringify(body);
    const actionMapStart = promptText.indexOf("page action map");
    const visibleIndexStart = promptText.lastIndexOf("current visible element index");
    const actionMap = promptText.slice(actionMapStart, visibleIndexStart);

    expect(actionMap).toContain("\\\"id\\\":\\\"u2\\\"");
    expect(actionMap).toContain("Stripe webhook secret");
    expect(actionMap).toContain("\\\"kind\\\":\\\"row\\\"");
    expect(actionMap).toContain("\\\"index\\\":2");
    expect(actionMap).toContain("likelyTargets");
    const likelyTargetsStart = actionMap.indexOf("\\\"likelyTargets\\\"");
    const formControlsStart = actionMap.indexOf("\\\"formControls\\\"");
    const likelyTargets = actionMap.slice(likelyTargetsStart, formControlsStart);
    expect(likelyTargets.indexOf("\\\"id\\\":\\\"u2\\\"")).toBeLessThan(likelyTargets.indexOf("\\\"id\\\":\\\"u1\\\""));
    expect(actionMap).toContain("\\\"reasons\\\"");
    expect(actionMap).toContain("context:stripe");
    expect(actionMap).toContain("duplicateLabels");
    expect(actionMap).toContain("GitHub token");
    expect(actionMap).toContain("Summer linen shirt");
  });

  it("ranks likely targets across common website DOM shapes", () => {
    const cases = [
      {
        name: "settings people tab for invite/member wording",
        prompt: "invite a member",
        expectedId: "u_people",
        uiFacts: [
          createUiFact("u_general", "General", "Organization", { selected: true }),
          createUiFact("u_people", "People", "Organization"),
          createUiFact("u_project_people", "People", "Project"),
          createUiFact("u_billing", "Billing", "Organization")
        ]
      },
      {
        name: "api dashboard create key button",
        prompt: "create an api token",
        expectedId: "u_create_key",
        uiFacts: [
          createActionUiFact("u_create_key", "Create API key", {
            context: "API keys",
            container: { kind: "section", label: "API keys", index: 1 }
          }),
          createUiFact("u_usage", "Usage", "Manage"),
          createUiFact("u_billing", "Billing", "Manage")
        ]
      },
      {
        name: "github repository pull requests tab",
        prompt: "open pull requests",
        expectedId: "u_pulls",
        uiFacts: [
          createUiFact("u_code", "Code", "Repository navigation", { selected: true }),
          createUiFact("u_issues", "Issues", "Repository navigation"),
          createUiFact("u_pulls", "Pull requests", "Repository navigation"),
          createUiFact("u_actions", "Actions", "Repository navigation")
        ]
      },
      {
        name: "github shorthand prs wording",
        prompt: "open PRs",
        expectedId: "u_pulls",
        uiFacts: [
          createUiFact("u_code", "Code", "Repository navigation", { selected: true }),
          createUiFact("u_issues", "Issues", "Repository navigation"),
          createUiFact("u_pulls", "Pull requests", "Repository navigation"),
          createUiFact("u_actions", "Actions", "Repository navigation")
        ]
      },
      {
        name: "gmail compose button",
        prompt: "compose a new email",
        expectedId: "u_compose",
        uiFacts: [
          createActionUiFact("u_compose", "Compose", {
            context: "Mail sidebar",
            container: { kind: "section", label: "Mail", index: 1 }
          }),
          createUiFact("u_inbox", "Inbox", "Mail sidebar", { selected: true }),
          createUiFact("u_sent", "Sent", "Mail sidebar")
        ]
      },
      {
        name: "gmail inbox for mail wording",
        prompt: "show my mail",
        expectedId: "u_inbox",
        uiFacts: [
          createActionUiFact("u_compose", "Compose", {
            context: "Mail sidebar",
            container: { kind: "section", label: "Mail", index: 1 }
          }),
          createUiFact("u_inbox", "Inbox", "Mail sidebar"),
          createUiFact("u_sent", "Sent", "Mail sidebar")
        ]
      },
      {
        name: "shopify orders search input",
        prompt: "search orders",
        expectedId: "u_search_orders",
        uiFacts: [
          createActionUiFact("u_create_order", "Create order", {
            context: "Orders",
            container: { kind: "section", label: "Orders", index: 1 }
          }),
          createInputUiFact("u_search_orders", "Search orders", "Orders toolbar"),
          createUiFact("u_products", "Products", "Admin navigation")
        ]
      },
      {
        name: "shopify shipping wording for orders nav",
        prompt: "where are shipments",
        expectedId: "u_orders",
        uiFacts: [
          createUiFact("u_orders", "Orders", "Admin navigation"),
          createUiFact("u_products", "Products", "Admin navigation"),
          createUiFact("u_customers", "Customers", "Admin navigation")
        ]
      },
      {
        name: "amazon checkout button",
        prompt: "go to checkout",
        expectedId: "u_checkout",
        uiFacts: [
          createActionUiFact("u_save", "Save for later", {
            context: "Shopping cart",
            container: { kind: "card", label: "Wireless mouse", index: 1 }
          }),
          createActionUiFact("u_checkout", "Proceed to checkout", {
            context: "Cart summary",
            container: { kind: "section", label: "Order summary", index: 1 }
          })
        ]
      },
      {
        name: "amazon bag wording for cart control",
        prompt: "open my bag",
        expectedId: "u_cart",
        uiFacts: [
          createUiFact("u_home", "Home", "Store navigation"),
          createUiFact("u_cart", "Cart", "Store navigation"),
          createUiFact("u_orders", "Orders", "Store navigation")
        ]
      },
      {
        name: "auth login wording for sign in label",
        prompt: "login",
        expectedId: "u_sign_in",
        uiFacts: [
          createActionUiFact("u_sign_in", "Sign in", {
            context: "Header",
            container: { kind: "section", label: "Account", index: 1 }
          }),
          createActionUiFact("u_register", "Create account", {
            context: "Header",
            container: { kind: "section", label: "Account", index: 1 }
          })
        ]
      },
      {
        name: "alerts wording for notifications control",
        prompt: "show alerts",
        expectedId: "u_notifications",
        uiFacts: [
          createActionUiFact("u_notifications", "Notifications", {
            context: "Top bar",
            container: { kind: "section", label: "User tools", index: 1 }
          }),
          createActionUiFact("u_profile", "Profile", {
            context: "Top bar",
            container: { kind: "section", label: "User tools", index: 1 }
          })
        ]
      }
    ];

    for (const testCase of cases) {
      const body = buildOpenAIRequestBody(config, {
        siteKey: "site_public",
        userPrompt: testCase.prompt,
        domSnapshot: {
          ...createDomSnapshot(),
          route: "/fixture",
          uiFacts: testCase.uiFacts,
          offscreenUiFacts: []
        }
      });
      const actionMap = extractActionMap(body);

      expect(actionMap.likelyTargets[0]?.id, testCase.name).toBe(testCase.expectedId);
      expect(
        [...actionMap.primaryControls, ...actionMap.navigationControls].some((control: { id: string }) => control.id === testCase.expectedId),
        testCase.name
      ).toBe(true);
    }
  });

  it("includes one-shot navigation continuation context without enabling route docs", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "show billing",
      domSnapshot: {
        ...createDomSnapshot(),
        route: "/settings/billing"
      },
      navigationContext: {
        originalPrompt: "show billing",
        targetRoute: "/settings/billing",
        previousRoute: "/dashboard",
        navigationCount: 1
      }
    });

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("navigation continuation context");
    expect(serialized).toContain("navigationCount");
    expect(serialized).toContain("1");
    expect(serialized).toContain("use only the current visible element index, page meta, and cleaned DOM tree below");
    expect(serialized).toContain("previous DOM snapshots in the conversation are stale");
  });

  it("keeps parent and child DOM context for icon/image buttons", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "where is the help center?",
      domSnapshot: createDomSnapshot()
    });

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("\\\"tag\\\":\\\"button\\\"");
    expect(serialized).toContain("\\\"tag\\\":\\\"img\\\"");
    expect(serialized).toContain("\\\"id\\\":\\\"help\\\"");
    expect(serialized).toContain("\\\"src\\\":\\\"/assets/global/helpcenter.svg\\\"");
  });

  it("includes multi-step guidance continuation context", () => {
    const body = buildOpenAIRequestBody(config, {
      siteKey: "site_public",
      userPrompt: "move the first item",
      domSnapshot: createDomSnapshot(),
      guidanceContext: {
        originalPrompt: "move the first item",
        step: 2,
        previousElementId: "c3",
        previousElementLabel: "edit",
        previousInstruction: "open this item's options"
      }
    });

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("multi-step guidance context");
    expect(serialized).toContain("previousElementId");
    expect(serialized).toContain("c3");
    expect(serialized).toContain("step");
    expect(serialized).toContain("2");
  });
});

function createDomSnapshot() {
  return {
    route: "/dashboard",
    viewportWidth: 1200,
    viewportHeight: 800,
    title: "Barkan dashboard",
    elements: [
      {
        id: "c1",
        tag: "button",
        label: "Centre d'aide",
        attributes: {
          id: "help"
        },
        rect: { x: 24, y: 120, width: 48, height: 48 },
        visibility: "visible" as const,
        interactive: true,
        children: [
          {
            id: "c2",
            tag: "img",
            label: "Centre d'aide",
            attributes: {
              src: "/assets/global/helpcenter.svg",
              alt: "Centre d'aide"
            },
            rect: { x: 34, y: 130, width: 24, height: 24 },
            visibility: "visible" as const,
            interactive: false
          },
          {
            id: "c3",
            tag: "div",
            attributes: {
              class: "ping"
            },
            rect: { x: 56, y: 124, width: 8, height: 8 },
            visibility: "visible" as const,
            interactive: false
          }
        ]
      }
    ],
    scrollSurfaces: [
      {
        id: "page",
        kind: "page" as const,
        label: "main page",
        rect: { x: 0, y: 0, width: 1200, height: 800 },
        scrollTop: 0,
        scrollHeight: 1600,
        clientHeight: 800,
        canScrollUp: false,
        canScrollDown: true
      }
    ],
    pageMeta: {
      title: "Barkan dashboard",
      route: "/dashboard",
      headings: ["Dashboard"],
      landmarks: ["main: Dashboard"],
      selectedNav: ["Dashboard"]
    }
  };
}

function createUiFact(id: string, label: string, context: string, state: Partial<{
  disabled: boolean;
  selected: boolean;
  expanded: boolean;
  required: boolean;
}> = {}) {
  return {
    id,
    kind: "link" as const,
    role: "link",
    label,
    context,
    href: `/settings/${label.toLowerCase()}`,
    metadata: {
      tagName: "a",
      classTokens: ["sidebar-item"]
    },
    state: {
      visible: true,
      disabled: false,
      selected: state.selected ?? false,
      expanded: state.expanded ?? false,
      required: state.required ?? false
    },
    rect: { x: 24, y: id === "u3" ? 830 : 320, width: 120, height: 36 }
  };
}

function createActionUiFact(
  id: string,
  label: string,
  options: {
    context: string;
    container: { kind: "row" | "card" | "listitem" | "section" | "form" | "group"; label: string; index: number };
  }
) {
  const numericSuffix = Number.parseInt(id.replace(/\D+/g, ""), 10);
  const rowIndex = Number.isFinite(numericSuffix) ? numericSuffix : options.container.index;
  return {
    id,
    kind: "button" as const,
    role: "button",
    label,
    context: options.context,
    metadata: {
      tagName: "button",
      iconName: label.toLowerCase() === "edit" ? "edit" : "more-horizontal",
      container: options.container
    },
    state: {
      visible: true,
      disabled: false,
      selected: false,
      expanded: false,
      required: false
    },
    rect: { x: 840, y: 220 + rowIndex * 46, width: 40, height: 32 }
  };
}

function createInputUiFact(id: string, label: string, context: string) {
  return {
    id,
    kind: "input" as const,
    role: "searchbox",
    label,
    context,
    metadata: {
      tagName: "input",
      type: "search",
      name: label.toLowerCase().replace(/\s+/g, "-")
    },
    state: {
      visible: true,
      disabled: false,
      selected: false,
      expanded: false,
      required: false
    },
    rect: { x: 240, y: 96, width: 360, height: 36 }
  };
}

function extractActionMap(body: Record<string, unknown>) {
  const input = body.input as Array<{ content: Array<{ text: string }> }>;
  const prompt = input[0]?.content[0]?.text ?? "";
  const actionMapStart = prompt.indexOf("{", prompt.indexOf("page action map:"));
  const actionMapEnd = prompt.indexOf("\n\ncurrent visible element index:", actionMapStart);
  if (actionMapStart < 0 || actionMapEnd < 0) {
    throw new Error("missing action map in prompt");
  }
  return JSON.parse(prompt.slice(actionMapStart, actionMapEnd));
}
