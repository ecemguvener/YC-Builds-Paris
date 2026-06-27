import type { AppConfig } from "./config.js";
import { buildOpenAIEndpointUrl } from "./openai.js";
import type { AtlasBackendEndpoint, AtlasBackendEndpointField, AtlasBackendInventoryDocument } from "./atlas/backend-inventory.js";

export interface WidgetHttpCallResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: unknown;
  error?: string;
}

export interface WidgetActionChoice {
  label: string;
  value: unknown;
}

export interface WidgetActionQuestion {
  message: string;
  choices?: WidgetActionChoice[];
  taskIds?: string[];
}

export interface WidgetActionPageContext {
  pathname: string;
  search?: string;
  hash?: string;
}

export interface WidgetGoalConversationEntry {
  role: "user" | "assistant" | "tool";
  text: string;
}

export interface WidgetActionAgentRequest {
  userMessage?: string;
  selectedChoice?: WidgetActionChoice;
  httpBatchResult?: WidgetHttpCallResult;
  goalRunState?: unknown;
  goalConversationContext?: WidgetGoalConversationEntry[];
  currentPage?: WidgetActionPageContext;
  backendInventory: AtlasBackendInventoryDocument;
}

export type WidgetActionAgentResponse =
  | { type: "progress"; goalRunState: GoalRunState; progress: ActionProgress }
  | { type: "ask_user"; message: string; goalRunState: GoalRunState; choices?: WidgetActionChoice[]; questions?: WidgetActionQuestion[]; progress?: ActionProgress }
  | { type: "execute"; goalRunState: GoalRunState; httpCall?: HttpCall; httpCalls?: HttpCall[]; progress?: ActionProgress }
  | { type: "final"; message: string; summaryTitle?: string; progress?: ActionProgress }
  | { type: "unavailable"; message: string; progress?: ActionProgress };

type GoalTaskStatus = "pending" | "ready" | "running" | "completed" | "partial" | "blocked" | "failed";

interface GoalTask {
  id: string;
  label: string;
  status: GoalTaskStatus;
  dependsOn: string[];
  endpointHints: string[];
  forEachSuccessfulResultOf?: string;
  statusReason?: string;
  progressLabel?: string;
}

interface GoalPlan {
  version: 1;
  originalUserMessage: string;
  tasks: GoalTask[];
}

interface PendingQuestion {
  message: string;
  choices?: WidgetActionChoice[];
  questions?: WidgetActionQuestion[];
  taskIds: string[];
}

interface AnsweredQuestion {
  message: string;
  choices?: WidgetActionChoice[];
  questions?: WidgetActionQuestion[];
  taskIds: string[];
  answer: WidgetActionChoice;
}

interface HttpCall {
  callId?: string;
  taskId?: string;
  itemKey?: string;
  method: string;
  documentedPath: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

interface ExecutedHttpCall {
  httpCall: HttpCall;
  result: WidgetHttpCallResult;
}

interface GoalRunState {
  version: 1;
  goalPlan?: GoalPlan;
  loadedEndpointDocKeys: string[];
  extraEndpointDocLoadCount: number;
  httpCallCount: number;
  failedHttpCallCount: number;
  repairFailuresByHttpCall: Record<string, number>;
  completedHttpCalls: ExecutedHttpCall[];
  failedHttpCalls: ExecutedHttpCall[];
  answeredQuestions: AnsweredQuestion[];
  pendingQuestion?: PendingQuestion;
  pendingFinalExplanation?: boolean;
}

interface ActionProgress {
  label: string;
}

type PlannerResponse = {
  type?: string;
  goalPlan?: unknown;
  endpointDocKeys?: unknown;
};

type BuilderResponse = {
  type?: string;
  endpointDocKeys?: unknown;
  method?: unknown;
  path?: unknown;
  message?: unknown;
  choices?: unknown;
  questions?: unknown;
  taskIds?: unknown;
  httpCall?: unknown;
  httpCalls?: unknown;
};

type FinalizerResponse = {
  type?: string;
  message?: unknown;
  summaryTitle?: unknown;
};

const maxInitialEndpointDocs = 20;
const maxExtraEndpointDocLoads = 5;
const maxHttpCalls = 100;
const maxParallelHttpCalls = 50;
const maxHttpCallRepairRetries = 2;
const maxBuilderTurns = 8;
const maxActionOutputTokens = 12000;
const creatingPlanProgressLabel = "Creating plan...";
const searchingDocumentationProgressLabel = "Searching documentation...";
const finishingProgressLabel = "Finishing up...";
const fallbackExecutionProgressLabel = "Running action";

const plannerPrompt = `
you are barkan action planner.

create a compact backend-action goal plan from the user's request.
use the full endpointCatalog to understand available backend capabilities.
do not create HTTP calls.

rules:
- return type plan_goal.
- split the user's goal into user-visible tasks.
- unrelated tasks must have no dependencies so code can run them simultaneously.
- dependent tasks must list dependsOn task ids.
- bulk requests such as "create 10 posts" should be one task, not one task per item.
- endpointHints should contain exact "METHOD /path" keys from endpointCatalog that may be needed.
- if child work should run for each successful parent item, set forEachSuccessfulResultOf to the parent task id.
- progressLabel should be a concise user-facing gerund phrase for that task, max 48 characters, such as "Creating posts" or "Deleting columns".
- progressLabel must not end with ellipses or trailing punctuation; the UI adds the loading ellipsis.
- progressLabel must not mention endpoints, backend, API, HTTP, JSON, docs, params, query, body, ids, or field names.
- if the user refers to existing records using human language such as a name, label, title, slug, category, visible text, ordinal, position, relative location, or "the one that...", include likely GET/list/search/read endpoint hints for that resource along with the mutation endpoint.
- generic, mock, sample, or placeholder content requests do not need a clarification task; plan the requested creation using sensible defaults.
- choose up to 20 endpointDocKeys likely needed first.

return strict json only.
`.trim();

const builderPrompt = `
you are barkan HTTP-call builder.

you receive code-owned goalRunState, endpointCatalog, loadedEndpointDocs, runnableTasks, and previous results.
build concrete documented same-origin HTTP calls only for currently runnable tasks, or request more endpoint docs, or ask the user for missing human values.

rules:
- return type build_http_calls, select_endpoint_docs, or ask_user.
- use loadedEndpointDocs as the source of truth for request shape.
- if a needed endpoint is not loaded, return select_endpoint_docs with endpointDocKeys copied exactly from endpointCatalog.
- if an endpoint is already present in loadedEndpointDocs, build_http_calls instead of selecting that doc again.
- max 5 extra endpoint docs are available for the whole user goal.
- use httpCalls for independent calls that can run in parallel.
- before returning build_http_calls, perform a required-field checklist for every call against loadedEndpointDocs.
- every loadedEndpointDocs required route param must be resolved and substituted into path; every required query/body field must be present in query/body with a non-null, non-empty value.
- process each runnable task in this order: load the endpoint docs, identify all required route/query/body fields, determine which required values are missing from the original user request and prior answers, perform needed lookups for required existing-record references, then ask all remaining independent questions together.
- if a required field has enum or allowedValues, the value must be one of those documented values. if the user's wording does not clearly choose one, ask_user instead of omitting it or guessing outside the docs.
- never rely on a backend failure to discover missing required fields; missing required params/query/body fields must be handled before execution.
- only build calls whose required values are known from userMessage, selectedChoice, currentPage, goalConversationContext, completedHttpCalls, failedHttpCalls, explicit documented default values, or documented lookup/list/search/read results.
- documented enum/allowedValues are not defaults and do not authorize choosing a value; use them as ask_user choices unless the user clearly selected or delegated that required value.
- if any required value is still unknown after using the available context and any needed documented lookup/list/search/read results, return ask_user; do not build the HTTP call and do not end the run as blocked merely because a required value is missing.
- if answeredQuestion is present, treat answeredQuestion.answer as the visitor's answer to answeredQuestion.message/questions. do not ask the same question again; continue using that answer.
- when a task depends on a prior create, use ids/fields from completedHttpCalls.
- for failedHttpCalls, repair only the failed calls using their error context. never repeat successful calls.
- avoid unnecessary questions only when required values are already known or explicitly delegated. asking for missing required fields is not over-asking.
- the user is allowed to refer to existing records the way a human would: names, labels, titles, slugs, categories, visible text, ordinals, positions, relative location, or descriptive phrases such as "the one that...".
- do not invent required user-visible values such as titles, names, colors, labels, categories, or descriptions unless the user explicitly delegates them with wording like generic, mock, sample, example, placeholder, any, I don't care, pick for me, choose for me, different, distinct, or unique.
- generic action wording such as "create a new item", "add one", "make a post", or "delete the item" is not delegation. if the required user-visible values or target references are not specified, look up what can be looked up, then ask_user for the missing required values.
- when the user explicitly delegates required user-visible values, invent reasonable harmless values that satisfy both the user's constraints and the documented required fields; if the user asks for multiple created records with different/distinct/unique values, choose valid distinct values without asking.
- for required references to existing records, never invent values and never ask for raw ids, database ids, internal identifiers, exact route params, or exact field names; use documented GET/list/search/read endpoints first, then ask the user to choose using human-readable names/labels unless the user explicitly named the target or the lookup proves exactly one possible target.
- route params and fields that are ids or existing-record references must use actual values from currentPage, completedHttpCalls, answeredQuestion values, or documented lookup/list/search/read results. never put a user-entered name/label/description directly into an id route param or id field.
- resolve existing-record references before asking. first identify the resource type from the user's wording and loaded docs, then select/load and call documented GET/list/search/read endpoints that can list or search that resource.
- use lookup/list/search/read results as context for later calls: ordinals and positions use the returned order when the response is ordered or naturally presented; names, labels, titles, slugs, categories, and visible text use exact or close human-readable matches; relative descriptions use the fields returned by the lookup; currentPage path/search may scope the lookup when docs support it.
- if a needed lookup endpoint is not loaded, return select_endpoint_docs for that endpoint instead of ask_user.
- if a lookup endpoint is loaded but has not been called yet, build the lookup HTTP call instead of ask_user.
- ask_user after the relevant lookup/read/list/search has been called when there is no exact user-specified match, more than one possible match, or any required user-visible value/reference that cannot be safely determined. never pick the first, current, default, or merely plausible existing record unless the user explicitly requested that record or the lookup proves it is the only possible target.
- for destructive actions such as delete, remove, archive, cancel, revoke, or disable, do not act on vague references like "the item", "that one", or "the current one" unless currentPage context or lookup results prove exactly one target; otherwise ask the user to choose by human-readable label before executing.
- when multiple independent human values are needed at the same time, always return one ask_user with a questions array instead of asking one at a time. include up to 3 non-dependent questions in one response; questions for user-visible free text may omit choices, but questions for required existing-record references must use choices from lookup results with human-readable labels and actual ids/reference values hidden in value.
- when asking after a lookup, present human-readable choices when possible and ask for the label/name/choice, not an id.
- user-facing ask_user messages must not mention endpoints, backend, API, JSON, params, fields, or docs.
- keep callId stable and unique, include taskId on every HTTP call, and include itemKey for bulk items when helpful.

return strict json only.
`.trim();

const finalizerPrompt = `
you are barkan action finalizer.

write a concise user-facing explanation of the completed action run.
also write a compact card title for the action summary UI.
the code-owned goalRunState is the source of truth. do not change statuses or invent work.
explain what succeeded. if anything failed or is blocked, use the task statusReason values to explain exactly what stopped the run in plain language.
never say no documentation was loaded, no actions were available, or no calls were created unless goalRunState proves that exact reason.
if every task is completed, do not mention repaired failures, failed attempts, retries, HTTP statuses, routing errors, backend errors, endpoint names, API details, IDs, JSON, params, fields, or docs.
for completed runs, summarize only the user-visible result.
summaryTitle must be short and card-like, for example "Edited 3 columns, 2 cards", "Created column New Column and 3 posts", or "Deleted 2 matching columns".
summaryTitle must name the user-visible resources changed and include counts when proven by goalRunState or completed results.
summaryTitle must not be a sentence explanation, must not start with "Done", and must not include markdown bullets.
do not mention endpoints, backend, API, JSON, params, fields, or docs unless an unrepaired backend status/error is needed to explain a blocked or failed run.

return strict json only: {"type":"final_explanation","message":"...","summaryTitle":"..."}
`.trim();

const plannerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["plan_goal"] },
    goalPlan: {
      type: "object",
      additionalProperties: false,
      properties: {
        originalUserMessage: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              endpointHints: { type: "array", items: { type: "string" } },
              forEachSuccessfulResultOf: { type: "string" },
              statusReason: { type: "string" },
              progressLabel: { type: "string" }
            },
            required: ["id", "label", "dependsOn", "endpointHints"]
          }
        }
      },
      required: ["originalUserMessage", "tasks"]
    },
    endpointDocKeys: { type: "array", maxItems: maxInitialEndpointDocs, items: { type: "string" } }
  },
  required: ["type", "goalPlan", "endpointDocKeys"]
};

const builderSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["select_endpoint_docs", "build_http_calls", "ask_user"] },
    endpointDocKeys: { type: "array", maxItems: maxExtraEndpointDocLoads, items: { type: "string" } },
    method: { type: "string" },
    path: { type: "string" },
    message: { type: "string" },
    taskIds: { type: "array", items: { type: "string" } },
    choices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" }, value: {} },
        required: ["label", "value"]
      }
    },
    questions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          message: { type: "string" },
          choices: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { label: { type: "string" }, value: {} },
              required: ["label", "value"]
            }
          },
          taskIds: { type: "array", items: { type: "string" } }
        },
        required: ["message"]
      }
    },
    httpCall: httpCallSchema(),
    httpCalls: { type: "array", maxItems: maxParallelHttpCalls, items: httpCallSchema() }
  },
  required: ["type"]
};

const finalizerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["final_explanation"] },
    message: { type: "string" },
    summaryTitle: { type: "string" }
  },
  required: ["type", "message", "summaryTitle"]
};

export async function generateWidgetActionResponse(
  config: AppConfig,
  request: WidgetActionAgentRequest,
  fetchImpl: typeof fetch = fetch
): Promise<WidgetActionAgentResponse> {
  if (request.backendInventory.endpoints.length === 0) {
    return {
      type: "unavailable",
      message: "Action mode needs backend documentation before I can take actions here."
    };
  }

  let goalRunState = prepareGoalRunState(request.goalRunState);
  if (request.httpBatchResult) {
    goalRunState = reduceHttpBatchResult(goalRunState, request.httpBatchResult);
  }

  let answeredQuestion: AnsweredQuestion | null = null;
  if ((request.userMessage || request.selectedChoice) && goalRunState.pendingQuestion) {
    answeredQuestion = buildAnsweredQuestion(goalRunState.pendingQuestion, request);
    goalRunState = {
      ...goalRunState,
      answeredQuestions: [...goalRunState.answeredQuestions, answeredQuestion].slice(-12),
      pendingQuestion: undefined
    };
  }

  if (goalRunState.pendingFinalExplanation) {
    const finalizerResponse = await requestFinalizer(config, request, { ...goalRunState, pendingFinalExplanation: false }, fetchImpl);
    return {
      type: "final",
      message: finalizerResponse.message,
      summaryTitle: finalizerResponse.summaryTitle,
      progress: createProgress(finishingProgressLabel)
    };
  }

  if (!goalRunState.goalPlan && request.userMessage) {
    const plannerResponse = await requestPlanner(config, request, fetchImpl);
    goalRunState = initializeGoalRunState(request, plannerResponse);
    return {
      type: "progress",
      goalRunState,
      progress: createProgress(searchingDocumentationProgressLabel)
    };
  }

  if (!goalRunState.goalPlan) {
    return {
      type: "final",
      message: "Action mode is for taking actions. Tell me what you want me to do."
    };
  }

  goalRunState = updateRunnableTaskStatuses(goalRunState);
  if (goalRunState.pendingQuestion) {
    return createAskUserResponse(goalRunState, goalRunState.pendingQuestion);
  }

  if (isGoalFinished(goalRunState)) {
    return createFinalizationProgress(goalRunState);
  }

  for (let turn = 0; turn < maxBuilderTurns; turn++) {
    const runnableTasks = getRunnableTasks(goalRunState);
    if (runnableTasks.length === 0) {
      goalRunState = blockTasksWithFailedDependencies(goalRunState);
      return createFinalizationProgress(goalRunState);
    }

    const builderResponse = await requestBuilder(config, request, goalRunState, runnableTasks, answeredQuestion, fetchImpl);
    if (builderResponse.type === "select_endpoint_docs") {
      const docLoadResult = loadRequestedEndpointDocs(request.backendInventory, goalRunState, builderResponse);
      if (!docLoadResult.ok) {
        return createFinalizationProgress(markRunnableTasksBlocked(goalRunState, "I could not find the needed documented action."));
      }
      goalRunState = docLoadResult.goalRunState;
      return {
        type: "progress",
        goalRunState,
        progress: createProgress(searchingDocumentationProgressLabel)
      };
    }

    if (builderResponse.type === "ask_user") {
      const pendingQuestion = readPendingQuestion(builderResponse);
      goalRunState = {
        ...goalRunState,
        pendingQuestion
      };
      return createAskUserResponse(goalRunState, pendingQuestion);
    }

    if (builderResponse.type === "build_http_calls") {
      const httpCalls = readHttpCalls(builderResponse);
      if (!httpCalls) {
        goalRunState = markRunnableTasksBlocked(goalRunState, "No executable HTTP calls were returned.");
        return createFinalizationProgress(goalRunState);
      }
      const validation = validateHttpCalls(request.backendInventory, goalRunState, httpCalls);
      if (!validation.ok) {
        goalRunState = markRunnableTasksBlocked(goalRunState, validation.message);
        return createFinalizationProgress(goalRunState);
      }

      goalRunState = markTasksRunning(goalRunState, httpCalls);
      return {
        type: "execute",
        goalRunState,
        ...(httpCalls.length === 1 ? { httpCall: httpCalls[0] } : { httpCalls }),
        progress: createProgress(getExecutionProgressLabel(goalRunState, httpCalls))
      };
    }
  }

  return createFinalizationProgress(markRunnableTasksBlocked(goalRunState, "I reached the action step limit before I could safely finish this."));
}

export function compactBackendInventory(inventory: AtlasBackendInventoryDocument) {
  return inventory.endpoints.map((endpoint) => ({
    method: endpoint.method.toUpperCase(),
    path: endpoint.path,
    summary: endpoint.summary
  }));
}

function createProgress(label: string): ActionProgress {
  return { label: sanitizeProgressLabel(label) ?? fallbackExecutionProgressLabel };
}

function createAskUserResponse(goalRunState: GoalRunState, pendingQuestion: PendingQuestion): WidgetActionAgentResponse {
  return {
    type: "ask_user",
    message: pendingQuestion.message,
    goalRunState,
    ...(pendingQuestion.choices?.length ? { choices: pendingQuestion.choices } : {}),
    ...(pendingQuestion.questions?.length ? { questions: pendingQuestion.questions } : {})
  };
}

function buildAnsweredQuestion(pendingQuestion: PendingQuestion, request: WidgetActionAgentRequest): AnsweredQuestion {
  const answer = request.selectedChoice ?? {
    label: request.userMessage ?? "Answered question",
    value: request.userMessage ?? ""
  };
  return {
    message: pendingQuestion.message,
    ...(pendingQuestion.choices?.length ? { choices: pendingQuestion.choices } : {}),
    ...(pendingQuestion.questions?.length ? { questions: pendingQuestion.questions } : {}),
    taskIds: pendingQuestion.taskIds,
    answer
  };
}

function createFinalizationProgress(goalRunState: GoalRunState): WidgetActionAgentResponse {
  return {
    type: "progress",
    goalRunState: { ...goalRunState, pendingFinalExplanation: true },
    progress: createProgress(finishingProgressLabel)
  };
}

function getExecutionProgressLabel(goalRunState: GoalRunState, httpCalls: HttpCall[]): string {
  const taskIds = uniqueStrings(httpCalls.map((httpCall) => httpCall.taskId).filter((taskId): taskId is string => Boolean(taskId)));
  if (taskIds.length !== 1) {
    return fallbackExecutionProgressLabel;
  }
  const task = goalRunState.goalPlan?.tasks.find((candidate) => candidate.id === taskIds[0]);
  return task?.progressLabel ?? inferProgressLabelFromTaskLabel(task?.label ?? "") ?? fallbackExecutionProgressLabel;
}

function inferProgressLabelFromTaskLabel(label: string): string | null {
  const cleaned = label.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return null;
  }
  const actionMatch = cleaned.match(/^(create|add|make|delete|remove|update|edit|rename|move|assign|publish|send|invite|set|mark|generate)\b\s*(.*)$/i);
  if (!actionMatch) {
    return sanitizeProgressLabel(cleaned);
  }
  const gerunds: Record<string, string> = {
    create: "Creating",
    add: "Adding",
    make: "Creating",
    delete: "Deleting",
    remove: "Removing",
    update: "Updating",
    edit: "Editing",
    rename: "Renaming",
    move: "Moving",
    assign: "Assigning",
    publish: "Publishing",
    send: "Sending",
    invite: "Inviting",
    set: "Setting",
    mark: "Marking",
    generate: "Generating"
  };
  const verb = gerunds[actionMatch[1]!.toLowerCase()] ?? "Running";
  const objectText = actionMatch[2]!
    .replace(/^(?:the|a|an|one)\s+/i, "")
    .replace(/\s+(?:called|named)\s+.+$/i, "")
    .trim();
  return sanitizeProgressLabel(`${verb}${objectText ? ` ${objectText}` : ""}`);
}

function sanitizeProgressLabel(value: string): string | null {
  const withoutDots = value.trim().replace(/\.+$/g, "").replace(/\s+/g, " ");
  if (!withoutDots) {
    return null;
  }
  if (
    withoutDots === creatingPlanProgressLabel.replace(/\.+$/g, "") ||
    withoutDots === searchingDocumentationProgressLabel.replace(/\.+$/g, "") ||
    withoutDots === finishingProgressLabel.replace(/\.+$/g, "")
  ) {
    return `${withoutDots}...`;
  }
  if (/\b(endpoint|backend|api|http|json|docs?|documentation|params?|query|body|field|fields?|ids?)\b/i.test(withoutDots)) {
    return null;
  }
  const clipped = withoutDots.slice(0, 48).trim();
  return clipped || null;
}

function httpCallSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      callId: { type: "string" },
      taskId: { type: "string" },
      itemKey: { type: "string" },
      method: { type: "string" },
      documentedPath: { type: "string" },
      path: { type: "string" },
      query: { type: "object", additionalProperties: true },
      body: { type: "object", additionalProperties: true }
    },
    required: ["method", "documentedPath", "path", "taskId"]
  };
}

function prepareGoalRunState(value: unknown): GoalRunState {
  const state = isRecord(value) ? value : {};
  return {
    version: 1,
    ...(normalizeGoalPlan(state.goalPlan) ? { goalPlan: normalizeGoalPlan(state.goalPlan)! } : {}),
    loadedEndpointDocKeys: readStringArray(state.loadedEndpointDocKeys),
    extraEndpointDocLoadCount: readNumber(state.extraEndpointDocLoadCount),
    httpCallCount: readNumber(state.httpCallCount),
    failedHttpCallCount: readNumber(state.failedHttpCallCount),
    repairFailuresByHttpCall: readNumberRecord(state.repairFailuresByHttpCall),
  completedHttpCalls: readExecutedHttpCalls(state.completedHttpCalls),
  failedHttpCalls: readExecutedHttpCalls(state.failedHttpCalls),
  answeredQuestions: readAnsweredQuestions(state.answeredQuestions),
  ...(readPendingQuestionFromState(state.pendingQuestion) ? { pendingQuestion: readPendingQuestionFromState(state.pendingQuestion)! } : {}),
  ...(state.pendingFinalExplanation === true ? { pendingFinalExplanation: true } : {})
  };
}

function initializeGoalRunState(request: WidgetActionAgentRequest, plannerResponse: PlannerResponse): GoalRunState {
  const goalPlan = normalizeGoalPlan(plannerResponse.goalPlan) ?? createFallbackGoalPlan(request.userMessage ?? "");
  const plannerSelectedDocKeys = readEndpointDocKeys(plannerResponse.endpointDocKeys, request.backendInventory, maxInitialEndpointDocs);
  const hintedDocKeys = readEndpointDocKeys(
    goalPlan.tasks.flatMap((task) => task.endpointHints),
    request.backendInventory,
    maxInitialEndpointDocs
  );
  const endpointDocKeys = uniqueStrings([...plannerSelectedDocKeys, ...hintedDocKeys]).slice(0, maxInitialEndpointDocs);
  return {
    version: 1,
    goalPlan,
    loadedEndpointDocKeys: endpointDocKeys,
    extraEndpointDocLoadCount: 0,
    httpCallCount: 0,
    failedHttpCallCount: 0,
    repairFailuresByHttpCall: {},
    completedHttpCalls: [],
    failedHttpCalls: [],
    answeredQuestions: []
  };
}

function normalizeGoalPlan(value: unknown): GoalPlan | null {
  if (!isRecord(value)) {
    return null;
  }
  const originalUserMessage = readNonEmptyString(value.originalUserMessage);
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map(readGoalTask).filter((task): task is GoalTask => task !== null).slice(0, 50)
    : [];
  if (tasks.length === 0) {
    return null;
  }
  return {
    version: 1,
    originalUserMessage,
    tasks
  };
}

function createFallbackGoalPlan(userMessage: string): GoalPlan {
  return {
    version: 1,
    originalUserMessage: userMessage.trim().slice(0, 1200),
    tasks: [
      {
        id: "task_1",
        label: userMessage.trim().slice(0, 240) || "Complete the requested action",
        status: "pending",
        dependsOn: [],
        endpointHints: [],
        progressLabel: sanitizeProgressLabel(`Running ${userMessage.trim().slice(0, 32)}`) ?? fallbackExecutionProgressLabel
      }
    ]
  };
}

function readGoalTask(value: unknown, index: number): GoalTask | null {
  if (!isRecord(value)) {
    return null;
  }
  const label = readNonEmptyString(value.label);
  if (!label) {
    return null;
  }
  return {
    id: sanitizeTaskId(readNonEmptyString(value.id) || `task_${index + 1}`),
    label: label.slice(0, 240),
    status: readGoalTaskStatus(value.status) ?? "pending",
    dependsOn: readStringArray(value.dependsOn).map(sanitizeTaskId).filter(Boolean).slice(0, 20),
    endpointHints: readStringArray(value.endpointHints).slice(0, 20),
    ...(readNonEmptyString(value.forEachSuccessfulResultOf)
      ? { forEachSuccessfulResultOf: sanitizeTaskId(readNonEmptyString(value.forEachSuccessfulResultOf)) }
      : {}),
    ...(readNonEmptyString(value.statusReason) ? { statusReason: readNonEmptyString(value.statusReason).slice(0, 500) } : {}),
    ...(readNonEmptyString(value.progressLabel) ? { progressLabel: sanitizeProgressLabel(readNonEmptyString(value.progressLabel)) ?? fallbackExecutionProgressLabel } : {})
  };
}

function readGoalTaskStatus(value: unknown): GoalTaskStatus | null {
  return value === "pending" ||
    value === "ready" ||
    value === "running" ||
    value === "completed" ||
    value === "partial" ||
    value === "blocked" ||
    value === "failed"
    ? value
    : null;
}

function updateRunnableTaskStatuses(goalRunState: GoalRunState): GoalRunState {
  if (!goalRunState.goalPlan) {
    return goalRunState;
  }
  const tasks = goalRunState.goalPlan.tasks.map((task) => {
    if (task.status !== "pending") {
      return task;
    }
    return areDependenciesSatisfied(goalRunState, task) ? { ...task, status: "ready" as const } : task;
  });
  return {
    ...goalRunState,
    goalPlan: {
      ...goalRunState.goalPlan,
      tasks
    }
  };
}

function getRunnableTasks(goalRunState: GoalRunState): GoalTask[] {
  return goalRunState.goalPlan?.tasks.filter((task) => task.status === "ready" || task.status === "partial") ?? [];
}

function areDependenciesSatisfied(goalRunState: GoalRunState, task: GoalTask): boolean {
  if (task.dependsOn.length === 0) {
    return true;
  }
  const tasksById = new Map(goalRunState.goalPlan?.tasks.map((candidate) => [candidate.id, candidate]) ?? []);
  return task.dependsOn.every((dependencyId) => {
    const dependency = tasksById.get(dependencyId);
    if (dependency?.status === "completed") {
      return true;
    }
    if (task.forEachSuccessfulResultOf === dependencyId) {
      return goalRunState.completedHttpCalls.some((item) => item.httpCall.taskId === dependencyId);
    }
    return false;
  });
}

function reduceHttpBatchResult(goalRunState: GoalRunState, httpBatchResult: WidgetHttpCallResult): GoalRunState {
  const items = readHttpBatchResultItems(httpBatchResult);
  if (items.length === 0) {
    return httpBatchResult.ok ? goalRunState : { ...goalRunState, failedHttpCallCount: goalRunState.failedHttpCallCount + 1 };
  }

  const completedHttpCalls = [...goalRunState.completedHttpCalls];
  let failedHttpCalls = [...goalRunState.failedHttpCalls];
  const repairFailuresByHttpCall = { ...goalRunState.repairFailuresByHttpCall };

  for (const item of items) {
    const key = buildHttpCallRequestKey(item.httpCall);
    if (item.result.ok) {
      completedHttpCalls.push(item);
      failedHttpCalls = failedHttpCalls.filter((failedItem) => buildHttpCallRequestKey(failedItem.httpCall) !== key);
      delete repairFailuresByHttpCall[key];
    } else {
      failedHttpCalls = failedHttpCalls.filter((failedItem) => buildHttpCallRequestKey(failedItem.httpCall) !== key);
      failedHttpCalls.push(item);
      repairFailuresByHttpCall[key] = (repairFailuresByHttpCall[key] ?? 0) + 1;
    }
  }

  const failedHttpCallCount = Math.max(0, ...Object.values(repairFailuresByHttpCall));
  return updateTaskStatusesFromCalls({
    ...goalRunState,
    completedHttpCalls,
    failedHttpCalls,
    repairFailuresByHttpCall,
    failedHttpCallCount
  });
}

function updateTaskStatusesFromCalls(goalRunState: GoalRunState): GoalRunState {
  if (!goalRunState.goalPlan) {
    return goalRunState;
  }
  const completedByTask = countCallsByTask(goalRunState.completedHttpCalls);
  const failedByTask = countCallsByTask(goalRunState.failedHttpCalls);
  const tasks = goalRunState.goalPlan.tasks.map((task) => {
    const completedCount = completedByTask.get(task.id) ?? 0;
    const failedCount = failedByTask.get(task.id) ?? 0;
    if (completedCount > 0 && failedCount === 0) {
      return { ...task, status: "completed" as const };
    }
    if (completedCount > 0 && failedCount > 0) {
      return { ...task, status: "partial" as const };
    }
    if (failedCount > 0) {
      const taskFailures = goalRunState.failedHttpCalls.filter((item) => item.httpCall.taskId === task.id);
      const canRepair = taskFailures.some((item) => (goalRunState.repairFailuresByHttpCall[buildHttpCallRequestKey(item.httpCall)] ?? 0) <= maxHttpCallRepairRetries);
      return { ...task, status: canRepair ? "ready" as const : "failed" as const };
    }
    return task.status === "running" ? { ...task, status: "pending" as const } : task;
  });
  return {
    ...goalRunState,
    goalPlan: {
      ...goalRunState.goalPlan,
      tasks
    }
  };
}

function markTasksRunning(goalRunState: GoalRunState, httpCalls: HttpCall[]): GoalRunState {
  const nextHttpCallCount = goalRunState.httpCallCount + httpCalls.length;
  const runningTaskIds = new Set(httpCalls.map((httpCall) => httpCall.taskId).filter(Boolean));
  const tasks = goalRunState.goalPlan?.tasks.map((task) =>
    runningTaskIds.has(task.id) ? { ...task, status: "running" as const } : task
  );
  return {
    ...goalRunState,
    httpCallCount: nextHttpCallCount,
    ...(tasks && goalRunState.goalPlan ? { goalPlan: { ...goalRunState.goalPlan, tasks } } : {})
  };
}

function markRunnableTasksBlocked(goalRunState: GoalRunState, _reason: string): GoalRunState {
  if (!goalRunState.goalPlan) {
    return goalRunState;
  }
  return {
    ...goalRunState,
    goalPlan: {
      ...goalRunState.goalPlan,
      tasks: goalRunState.goalPlan.tasks.map((task) =>
        task.status === "ready" || task.status === "partial" || task.status === "pending"
          ? { ...task, status: "blocked" as const, statusReason: _reason.slice(0, 500) }
          : task
      )
    }
  };
}

function blockTasksWithFailedDependencies(goalRunState: GoalRunState): GoalRunState {
  if (!goalRunState.goalPlan) {
    return goalRunState;
  }
  const tasksById = new Map(goalRunState.goalPlan.tasks.map((task) => [task.id, task]));
  return {
    ...goalRunState,
    goalPlan: {
      ...goalRunState.goalPlan,
      tasks: goalRunState.goalPlan.tasks.map((task) => {
        if (task.status !== "pending") {
          return task;
        }
        const hasFailedDependency = task.dependsOn.some((dependencyId) => {
          const dependency = tasksById.get(dependencyId);
          return dependency?.status === "failed" || dependency?.status === "blocked";
        });
        return hasFailedDependency
          ? { ...task, status: "blocked" as const, statusReason: "A prerequisite task failed or was blocked." }
          : task;
      })
    }
  };
}

function isGoalFinished(goalRunState: GoalRunState): boolean {
  const tasks = goalRunState.goalPlan?.tasks ?? [];
  return tasks.length > 0 && tasks.every((task) => {
    if (task.status === "partial") {
      return !hasRepairableFailuresForTask(goalRunState, task.id);
    }
    return ["completed", "blocked", "failed"].includes(task.status);
  });
}

function hasRepairableFailuresForTask(goalRunState: GoalRunState, taskId: string): boolean {
  return goalRunState.failedHttpCalls.some((item) => {
    if (item.httpCall.taskId !== taskId) {
      return false;
    }
    return (goalRunState.repairFailuresByHttpCall[buildHttpCallRequestKey(item.httpCall)] ?? 0) <= maxHttpCallRepairRetries;
  });
}

function loadRequestedEndpointDocs(
  inventory: AtlasBackendInventoryDocument,
  goalRunState: GoalRunState,
  builderResponse: BuilderResponse
): { ok: true; goalRunState: GoalRunState } | { ok: false } {
  const requestedKeys = readBuilderEndpointDocKeys(builderResponse, inventory);
  if (requestedKeys.length === 0) {
    return { ok: false };
  }
  const newKeys = requestedKeys.filter((key) => !goalRunState.loadedEndpointDocKeys.includes(key));
  if (newKeys.length === 0) {
    return { ok: true, goalRunState };
  }
  const remaining = Math.max(0, maxExtraEndpointDocLoads - goalRunState.extraEndpointDocLoadCount);
  const acceptedKeys = newKeys.slice(0, remaining);
  if (acceptedKeys.length === 0) {
    return { ok: false };
  }
  return {
    ok: true,
    goalRunState: {
      ...goalRunState,
      loadedEndpointDocKeys: [...goalRunState.loadedEndpointDocKeys, ...acceptedKeys],
      extraEndpointDocLoadCount: goalRunState.extraEndpointDocLoadCount + acceptedKeys.length
    }
  };
}

function validateHttpCalls(
  inventory: AtlasBackendInventoryDocument,
  goalRunState: GoalRunState,
  httpCalls: HttpCall[] | null
): { ok: true } | { ok: false; message: string } {
  if (!httpCalls || httpCalls.length === 0) {
    return { ok: false, message: "No executable HTTP calls were returned." };
  }
  if (httpCalls.length > maxParallelHttpCalls) {
    return { ok: false, message: "Too many HTTP calls were returned at once." };
  }
  if (goalRunState.httpCallCount + httpCalls.length > maxHttpCalls) {
    return { ok: false, message: "The action reached the HTTP call limit." };
  }

  const taskIds = new Set(goalRunState.goalPlan?.tasks.map((task) => task.id) ?? []);
  const runnableTaskIds = new Set(getRunnableTasks(goalRunState).map((task) => task.id));
  const completedHttpCallKeys = new Set(goalRunState.completedHttpCalls.map((item) => buildHttpCallRequestKey(item.httpCall)));
  for (const httpCall of httpCalls) {
    if (!httpCall.taskId || !taskIds.has(httpCall.taskId)) {
      return { ok: false, message: "An HTTP call did not map to a known task." };
    }
    if (!runnableTaskIds.has(httpCall.taskId)) {
      return { ok: false, message: "An HTTP call mapped to a task that is not runnable yet." };
    }
    if (completedHttpCallKeys.has(buildHttpCallRequestKey(httpCall))) {
      return { ok: false, message: "An HTTP call tried to repeat work that already succeeded." };
    }
    if ((goalRunState.repairFailuresByHttpCall[buildHttpCallRequestKey(httpCall)] ?? 0) > maxHttpCallRepairRetries) {
      return { ok: false, message: "An HTTP call exceeded the retry limit for that request." };
    }
    const endpoint = findEndpoint(inventory, httpCall.method, httpCall.documentedPath);
    if (!endpoint || !goalRunState.loadedEndpointDocKeys.includes(buildEndpointKey(endpoint.method, endpoint.path))) {
      return { ok: false, message: "An HTTP call used an endpoint whose docs were not loaded." };
    }
    if (!isSafeDocumentedRequest(endpoint, httpCall)) {
      return { ok: false, message: "An HTTP call did not match the documented path." };
    }
    const routeParamValidation = validateDocumentedRouteParams(endpoint, httpCall);
    if (!routeParamValidation.ok) {
      return routeParamValidation;
    }
    const fieldValidation = validateDocumentedFields(endpoint, httpCall);
    if (!fieldValidation.ok) {
      return fieldValidation;
    }
  }
  return { ok: true };
}

function validateDocumentedFields(endpoint: AtlasBackendEndpoint, httpCall: HttpCall): { ok: true } | { ok: false; message: string } {
  for (const [name, field] of Object.entries(endpoint.request.query ?? {})) {
    const value = httpCall.query?.[name];
    if (field.required && isMissingRequiredValue(value)) {
      return { ok: false, message: `Missing required query value ${name}.` };
    }
    const allowedValues = readDocumentedAllowedValues(field);
    if (value !== undefined && allowedValues.length > 0 && !allowedValues.includes(String(value))) {
      return { ok: false, message: `Invalid query value ${name}.` };
    }
    if (looksLikeIdFieldName(name) && isHumanLabelLikeIdValue(value)) {
      return { ok: false, message: `Required reference ${name} was not resolved to an id.` };
    }
  }
  for (const [name, field] of Object.entries(endpoint.request.body ?? {})) {
    const value = httpCall.body?.[name];
    if (field.required && isMissingRequiredValue(value)) {
      return { ok: false, message: `Missing required body value ${name}.` };
    }
    const allowedValues = readDocumentedAllowedValues(field);
    if (value !== undefined && allowedValues.length > 0 && !allowedValues.includes(String(value))) {
      return { ok: false, message: `Invalid body value ${name}.` };
    }
    if (looksLikeIdFieldName(name) && isHumanLabelLikeIdValue(value)) {
      return { ok: false, message: `Required reference ${name} was not resolved to an id.` };
    }
  }
  return { ok: true };
}

function validateDocumentedRouteParams(endpoint: AtlasBackendEndpoint, httpCall: HttpCall): { ok: true } | { ok: false; message: string } {
  const concreteParts = httpCall.path.split("?")[0]?.split("/").filter(Boolean) ?? [];
  const documentedParts = endpoint.path.split("/").filter(Boolean);
  for (let index = 0; index < documentedParts.length; index++) {
    const documentedPart = documentedParts[index];
    const concretePart = concreteParts[index];
    if (!documentedPart || !concretePart || !isPathParamSegment(documentedPart)) {
      continue;
    }
    if (looksLikeIdFieldName(readPathParamName(documentedPart)) && isHumanLabelLikeIdValue(concretePart)) {
      return { ok: false, message: "A required route reference was not resolved to an id." };
    }
  }
  return { ok: true };
}

function readPathParamName(segment: string): string {
  return segment.replace(/^[:{[]/, "").replace(/[}\]]$/, "");
}

function looksLikeIdFieldName(name: string): boolean {
  return /(?:^id$|[_-]id$|Id$|ID$)/.test(name.trim());
}

function isHumanLabelLikeIdValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const decoded = safeDecodeURIComponent(value).trim();
  return /\s/.test(decoded);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readDocumentedAllowedValues(field: AtlasBackendEndpointField): string[] {
  return field.enum?.length ? field.enum : field.allowedValues ?? [];
}

function isMissingRequiredValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length === 0);
}

async function requestPlanner(
  config: AppConfig,
  request: WidgetActionAgentRequest,
  fetchImpl: typeof fetch
): Promise<PlannerResponse> {
  return await requestModelJson<PlannerResponse>(config, {
    instructions: plannerPrompt,
    schemaName: "barkan_action_goal_planner",
    schema: plannerSchema,
    input: {
      userMessage: request.userMessage ?? "",
      currentPage: request.currentPage ?? null,
      goalConversationContext: request.goalConversationContext ?? [],
      endpointCatalog: compactBackendInventory(request.backendInventory)
    }
  }, fetchImpl);
}

async function requestBuilder(
  config: AppConfig,
  request: WidgetActionAgentRequest,
  goalRunState: GoalRunState,
  runnableTasks: GoalTask[],
  answeredQuestion: AnsweredQuestion | null,
  fetchImpl: typeof fetch
): Promise<BuilderResponse> {
  const loadedEndpointDocs = request.backendInventory.endpoints.filter((endpoint) =>
    goalRunState.loadedEndpointDocKeys.includes(buildEndpointKey(endpoint.method, endpoint.path))
  );
  return await requestModelJson<BuilderResponse>(config, {
    instructions: builderPrompt,
    schemaName: "barkan_action_http_builder",
    schema: builderSchema,
    input: {
      userMessage: request.userMessage ?? null,
      selectedChoice: request.selectedChoice ?? null,
      answeredQuestion,
      currentPage: request.currentPage ?? null,
      goalConversationContext: request.goalConversationContext ?? [],
      goalRunState,
      runnableTasks,
      limits: {
        maxParallelHttpCalls,
        maxHttpCalls,
        httpCallsSoFar: goalRunState.httpCallCount,
        maxExtraEndpointDocLoads,
        extraEndpointDocLoadsSoFar: goalRunState.extraEndpointDocLoadCount,
        maxHttpCallRepairRetries
      },
      endpointCatalog: compactBackendInventory(request.backendInventory),
      loadedEndpointDocs
    }
  }, fetchImpl);
}

async function requestFinalizer(
  config: AppConfig,
  request: WidgetActionAgentRequest,
  goalRunState: GoalRunState,
  fetchImpl: typeof fetch
): Promise<{ message: string; summaryTitle: string }> {
  const finalizerInput = buildFinalizerInput(request, goalRunState);
  const response = await requestModelJson<FinalizerResponse>(config, {
    instructions: finalizerPrompt,
    schemaName: "barkan_action_finalizer",
    schema: finalizerSchema,
    input: finalizerInput
  }, fetchImpl);
  return {
    message: readNonEmptyString(response.message) || buildFallbackFinalMessage(goalRunState),
    summaryTitle: readNonEmptyString(response.summaryTitle) || buildFallbackSummaryTitle(goalRunState)
  };
}

function buildFinalizerInput(request: WidgetActionAgentRequest, goalRunState: GoalRunState): Record<string, unknown> {
  if (!isCompletedGoal(goalRunState)) {
    return {
      userMessage: request.userMessage ?? null,
      selectedChoice: request.selectedChoice ?? null,
      goalConversationContext: request.goalConversationContext ?? [],
      goalRunState
    };
  }

  return {
    userMessage: request.userMessage ?? goalRunState.goalPlan?.originalUserMessage ?? null,
    selectedChoice: request.selectedChoice ?? null,
    goalConversationContext: sanitizeCompletedGoalConversationContext(request.goalConversationContext ?? []),
    goalRunState: buildCompletedGoalFinalizerState(goalRunState)
  };
}

function isCompletedGoal(goalRunState: GoalRunState): boolean {
  const tasks = goalRunState.goalPlan?.tasks ?? [];
  return tasks.length > 0 && tasks.every((task) => task.status === "completed");
}

function buildCompletedGoalFinalizerState(goalRunState: GoalRunState): Record<string, unknown> {
  return {
    version: goalRunState.version,
    ...(goalRunState.goalPlan
      ? {
          goalPlan: {
            version: goalRunState.goalPlan.version,
            originalUserMessage: goalRunState.goalPlan.originalUserMessage,
            tasks: goalRunState.goalPlan.tasks.map((task) => ({
              id: task.id,
              label: task.label,
              status: task.status
            }))
          }
        }
      : {}),
    completedHttpCalls: goalRunState.completedHttpCalls.map((item) => ({
      httpCall: {
        taskId: item.httpCall.taskId,
        ...(item.httpCall.itemKey ? { itemKey: item.httpCall.itemKey } : {})
      },
      result: {
        ok: true,
        ...("body" in item.result ? { body: item.result.body } : {})
      }
    }))
  };
}

function sanitizeCompletedGoalConversationContext(entries: WidgetGoalConversationEntry[]): WidgetGoalConversationEntry[] {
  return entries.filter((entry) => entry.role !== "tool");
}

async function requestModelJson<T>(
  config: AppConfig,
  {
    instructions,
    schemaName,
    schema,
    input
  }: {
    instructions: string;
    schemaName: string;
    schema: Record<string, unknown>;
    input: unknown;
  },
  fetchImpl: typeof fetch
): Promise<T> {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured");
  }

  const response = await fetchImpl(buildOpenAIEndpointUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: config.OPENAI_ACTION_MODEL,
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(input) }]
        }
      ],
      temperature: 0,
      max_output_tokens: maxActionOutputTokens,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: false
        }
      }
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI action agent failed ${response.status}: ${responseText.slice(0, 500)}`);
  }

  const outputText = readOpenAIOutputText(responseText);
  if (!outputText) {
    throw new Error("OpenAI returned no action response");
  }
  return JSON.parse(outputText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as T;
}

function readBuilderEndpointDocKeys(response: BuilderResponse, inventory: AtlasBackendInventoryDocument): string[] {
  const directKeys = readEndpointDocKeys(response.endpointDocKeys, inventory, maxExtraEndpointDocLoads);
  if (directKeys.length > 0) {
    return directKeys;
  }
  const method = readNonEmptyString(response.method);
  const path = readNonEmptyString(response.path);
  const endpoint = findEndpoint(inventory, method, path);
  return endpoint ? [buildEndpointKey(endpoint.method, endpoint.path)] : [];
}

function readEndpointDocKeys(value: unknown, inventory: AtlasBackendInventoryDocument, limit: number): string[] {
  const catalogKeys = new Set(inventory.endpoints.map((endpoint) => buildEndpointKey(endpoint.method, endpoint.path)));
  return readStringArray(value)
    .map(normalizeEndpointDocKey)
    .filter((key) => catalogKeys.has(key))
    .slice(0, limit);
}

function normalizeEndpointDocKey(value: string): string {
  const match = value.trim().match(/^([A-Za-z]+)\s+(.+)$/);
  if (!match) {
    return value.trim();
  }
  return buildEndpointKey(match[1]!, match[2]!);
}

function readPendingQuestion(response: BuilderResponse): PendingQuestion {
  const questions = readPendingQuestions(response.questions);
  if (questions.length > 0) {
    return {
      message: questions[0]?.message ?? "What should I use for that action?",
      choices: questions[0]?.choices,
      questions,
      taskIds: [
        ...new Set([
          ...readStringArray(response.taskIds).map(sanitizeTaskId).filter(Boolean),
          ...questions.flatMap((question) => question.taskIds ?? [])
        ])
      ]
    };
  }

  return {
    message: readNonEmptyString(response.message) || "What should I use for that action?",
    choices: readChoices(response.choices),
    taskIds: readStringArray(response.taskIds).map(sanitizeTaskId).filter(Boolean)
  };
}

function readPendingQuestionFromState(value: unknown): PendingQuestion | null {
  if (!isRecord(value)) {
    return null;
  }
  const message = readNonEmptyString(value.message);
  if (!message) {
    return null;
  }
  return {
    message,
    choices: readChoices(value.choices),
    questions: readPendingQuestions(value.questions),
    taskIds: readStringArray(value.taskIds).map(sanitizeTaskId).filter(Boolean)
  };
}

function readAnsweredQuestions(value: unknown): AnsweredQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(-12)
    .map((item): AnsweredQuestion | null => {
      if (!isRecord(item) || !isRecord(item.answer)) {
        return null;
      }
      const message = readNonEmptyString(item.message);
      const label = readNonEmptyString(item.answer.label);
      if (!message || !label) {
        return null;
      }
      return {
        message,
        choices: readChoices(item.choices),
        questions: readPendingQuestions(item.questions),
        taskIds: readStringArray(item.taskIds).map(sanitizeTaskId).filter(Boolean),
        answer: {
          label,
          value: item.answer.value
        }
      };
    })
    .filter((item): item is AnsweredQuestion => item !== null);
}

function readPendingQuestions(value: unknown): WidgetActionQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 3)
    .map((question): WidgetActionQuestion | null => {
      if (!isRecord(question)) {
        return null;
      }
      const message = readNonEmptyString(question.message);
      if (!message) {
        return null;
      }
      const choices = readChoices(question.choices);
      return {
        message,
        ...(choices.length > 0 ? { choices } : {}),
        taskIds: readStringArray(question.taskIds).map(sanitizeTaskId).filter(Boolean)
      };
    })
    .filter((question): question is WidgetActionQuestion => question !== null);
}

function readHttpCalls(response: BuilderResponse): HttpCall[] | null {
  if (Array.isArray(response.httpCalls)) {
    const httpCalls = response.httpCalls.map(readHttpCall).filter((httpCall): httpCall is HttpCall => httpCall !== null);
    return httpCalls.length > 0 ? httpCalls.slice(0, maxParallelHttpCalls) : null;
  }
  const httpCall = readHttpCall(response.httpCall);
  return httpCall ? [httpCall] : null;
}

function readHttpCall(value: unknown): HttpCall | null {
  if (!isRecord(value)) {
    return null;
  }
  const method = readNonEmptyString(value.method).toUpperCase();
  const documentedPath = normalizePath(readNonEmptyString(value.documentedPath));
  const path = normalizePath(readNonEmptyString(value.path));
  const taskId = sanitizeTaskId(readNonEmptyString(value.taskId));
  if (!method || !documentedPath || !path || !taskId) {
    return null;
  }
  return {
    method,
    documentedPath,
    path,
    taskId,
    callId: readNonEmptyString(value.callId) || `${taskId}:${method}:${path}:${stableStringify(value.body ?? value.query ?? {})}`.slice(0, 180),
    ...(readNonEmptyString(value.itemKey) ? { itemKey: readNonEmptyString(value.itemKey) } : {}),
    ...(isRecord(value.query) ? { query: value.query } : {}),
    ...(isRecord(value.body) ? { body: value.body } : {})
  };
}

function readHttpBatchResultItems(value: WidgetHttpCallResult): ExecutedHttpCall[] {
  if (!Array.isArray(value.body)) {
    return [];
  }
  return value.body
    .map((item) => {
      if (!isRecord(item) || !isRecord(item.result)) {
        return null;
      }
      const httpCall = readHttpCall(item.httpCall);
      if (!httpCall || typeof item.result.ok !== "boolean") {
        return null;
      }
      return {
        httpCall,
        result: {
          ok: item.result.ok,
          ...(typeof item.result.status === "number" ? { status: item.result.status } : {}),
          ...(typeof item.result.contentType === "string" ? { contentType: item.result.contentType } : {}),
          ...("body" in item.result ? { body: item.result.body } : {}),
          ...(typeof item.result.error === "string" ? { error: item.result.error } : {})
        }
      };
    })
    .filter((item): item is ExecutedHttpCall => item !== null);
}

function readExecutedHttpCalls(value: unknown): ExecutedHttpCall[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const httpCall = readHttpCall(item.httpCall);
      const result = isRecord(item.result) && typeof item.result.ok === "boolean" ? item.result : null;
      return httpCall && result ? { httpCall, result: result as unknown as WidgetHttpCallResult } : null;
    })
    .filter((item): item is ExecutedHttpCall => item !== null)
    .slice(-100);
}

function countCallsByTask(items: ExecutedHttpCall[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.httpCall.taskId) {
      counts.set(item.httpCall.taskId, (counts.get(item.httpCall.taskId) ?? 0) + 1);
    }
  }
  return counts;
}

function buildFallbackFinalMessage(goalRunState: GoalRunState): string {
  const tasks = goalRunState.goalPlan?.tasks ?? [];
  const completed = tasks.filter((task) => task.status === "completed").map((task) => task.label);
  const incomplete = tasks.filter((task) => task.status !== "completed").map((task) =>
    task.statusReason ? `${task.label} (${task.statusReason})` : task.label
  );
  if (completed.length > 0 && incomplete.length === 0) {
    return `Done. ${completed.slice(0, 5).join("; ")}`;
  }
  if (completed.length > 0) {
    return `I completed: ${completed.slice(0, 5).join("; ")}. I could not finish: ${incomplete.slice(0, 5).join("; ")}.`;
  }
  return "I could not safely finish that action.";
}

function buildFallbackSummaryTitle(goalRunState: GoalRunState): string {
  const completedCalls = goalRunState.completedHttpCalls.filter((item) => item.result.ok);
  const mutationGroups = new Map<string, number>();
  const methods = new Set<string>();

  for (const item of completedCalls) {
    const method = item.httpCall.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      continue;
    }
    methods.add(method);
    const resourceName = inferActionResourceName(item.httpCall.documentedPath || item.httpCall.path);
    mutationGroups.set(resourceName, (mutationGroups.get(resourceName) ?? 0) + 1);
  }

  const resources = [...mutationGroups.entries()]
    .slice(0, 3)
    .map(([resource, count]) => `${count} ${count === 1 ? singularizeResourceName(resource) : resource}`);

  if (resources.length > 0) {
    return `${getFallbackSummaryVerb(methods)} ${resources.join(", ")}`;
  }

  const completedTask = goalRunState.goalPlan?.tasks.find((task) => task.status === "completed");
  return completedTask?.label || goalRunState.goalPlan?.originalUserMessage || "Completed action";
}

function getFallbackSummaryVerb(methods: Set<string>): string {
  if (methods.size === 1 && methods.has("POST")) {
    return "Created";
  }
  if (methods.size === 1 && methods.has("DELETE")) {
    return "Deleted";
  }
  return "Edited";
}

function inferActionResourceName(path: string): string {
  const segment = path
    .split("?")[0]!
    .split("/")
    .filter((part) => part && !part.startsWith(":") && !part.startsWith("{") && !part.startsWith("["))
    .reverse()
    .find((part) => !/^(api|v\d+|id)$/i.test(part) && !/^\d+$/.test(part) && !/^[a-f0-9]{12,}$/i.test(part));
  return normalizeResourceName(segment || "items");
}

function normalizeResourceName(value: string): string {
  const cleaned = value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return cleaned.endsWith("s") ? cleaned : `${cleaned}s`;
}

function singularizeResourceName(value: string): string {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function buildHttpCallRequestKey(httpCall: HttpCall): string {
  return stableStringify({
    method: httpCall.method.toUpperCase(),
    documentedPath: normalizePath(httpCall.documentedPath),
    path: normalizePath(httpCall.path),
    query: httpCall.query ?? {},
    body: httpCall.body ?? {},
    taskId: httpCall.taskId ?? "",
    itemKey: httpCall.itemKey ?? ""
  });
}

function isSafeDocumentedRequest(endpoint: AtlasBackendEndpoint, httpCall: HttpCall): boolean {
  return (
    httpCall.method === endpoint.method.toUpperCase() &&
    isSafeActionPath(httpCall.path) &&
    doesConcretePathMatchDocumentedPath(httpCall.path, endpoint.path)
  );
}

function doesConcretePathMatchDocumentedPath(concretePath: string, documentedPath: string): boolean {
  const concreteParts = concretePath.split("?")[0]?.split("/").filter(Boolean) ?? [];
  const documentedParts = documentedPath.split("/").filter(Boolean);
  if (concreteParts.length !== documentedParts.length) {
    return false;
  }
  return documentedParts.every((part, index) =>
    isPathParamSegment(part) ? Boolean(concreteParts[index]) : concreteParts[index] === part
  );
}

function isPathParamSegment(segment: string): boolean {
  return (
    segment.startsWith(":") ||
    (segment.startsWith("{") && segment.endsWith("}")) ||
    (segment.startsWith("[") && segment.endsWith("]"))
  );
}

function findEndpoint(inventory: AtlasBackendInventoryDocument, method: string, path: string): AtlasBackendEndpoint | null {
  const key = buildEndpointKey(method, normalizePath(path));
  return inventory.endpoints.find((endpoint) => buildEndpointKey(endpoint.method, endpoint.path) === key) ?? null;
}

function buildEndpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.length > 1 ? prefixed.replace(/\/+$/, "") : prefixed;
}

function isSafeActionPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(path)
  );
}

function readChoices(value: unknown): WidgetActionChoice[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((choice) => {
      if (!isRecord(choice)) {
        return null;
      }
      const label = readNonEmptyString(choice.label);
      return label ? { label, value: choice.value } : null;
    })
    .filter((choice): choice is WidgetActionChoice => choice !== null)
    .slice(0, 100);
}

function readOpenAIOutputText(responseText: string): string {
  const response = JSON.parse(responseText) as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content): content is { type: string; text: string } =>
        content.type === "output_text" && typeof content.text === "string"
      )
      .map((content) => content.text)
      .join("") ?? ""
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeTaskId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function readNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, readNumber(item)] as const)
      .filter(([, count]) => count > 0)
  );
}
