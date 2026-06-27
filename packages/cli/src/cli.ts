import readline from "node:readline/promises";
import { stdin as processStdin } from "node:process";
import { connectToBarkan, getBarkanAgentStatus } from "./api.js";
import { readExistingBarkanConfig, removeBarkanProjectFiles, writeBarkanConfig } from "./config.js";
import type { BarkanConnection } from "./connection.js";
import { readConnection, removeConnection, writeConnection } from "./connection.js";
import { runLocalAgent, startLocalAgent, stopLocalAgent } from "./agent.js";
import { createCliUi } from "./ui.js";

export interface RunCliOptions {
  argv?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  fetchImplementation?: typeof fetch;
  readApiKey?: () => Promise<string>;
}

interface ConnectArgs {
  apiBaseUrl: string;
}

const defaultApiBaseUrl = "http://localhost:4000";

export async function runCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  fetchImplementation,
  readApiKey
}: RunCliOptions = {}): Promise<number> {
  const ui = createCliUi(stdout, stderr);

  try {
    if (argv.includes("--help") || argv.includes("-h")) {
      stdout.write(`${getHelpText()}\n`);
      return 0;
    }

    if (argv[0] === "connect") {
      return await runConnect({
        args: parseConnectArgs(argv.slice(1), env),
        cwd,
        env,
        stderr,
        stdout,
        fetchImplementation,
        readApiKey
      });
    }

    if (argv[0] === "disconnect") {
      return await runDisconnect({ cwd, env, stderr, stdout });
    }

    if (argv[0] === "status") {
      return await runStatus({ cwd, env, stderr, stdout, title: "Barkan Status", fetchImplementation });
    }

    if (argv[0] === "__agent") {
      return await runLocalAgent(parseAgentArgs(argv.slice(1), cwd), env);
    }

    throw new CliUsageError(`Unknown command: ${argv.join(" ") || "(none)"}`);
  } catch (error) {
    ui.error(getErrorMessage(error));

    if (error instanceof CliUsageError) {
      stderr.write(`\n${getHelpText()}\n`);
    }

    return 1;
  }
}

function parseConnectArgs(args: string[], env: NodeJS.ProcessEnv): ConnectArgs {
  let apiBaseUrl = env.BARKAN_API_URL || env.PUBLIC_API_URL || defaultApiBaseUrl;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--api-key" || arg.startsWith("--api-key=")) {
      throw new CliUsageError("`--api-key` is not supported. Run `barkan connect` and paste the key at the prompt.");
    }

    if (arg === "--api-url") {
      apiBaseUrl = readFlagValue(args, index, "--api-url");
      index += 1;
      continue;
    }

    if (arg.startsWith("--api-url=")) {
      apiBaseUrl = arg.slice("--api-url=".length);
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new CliUsageError("API keys cannot be passed as command-line arguments. Run `barkan connect` and paste the key at the prompt.");
    }

    throw new CliUsageError(`Unknown option: ${arg}`);
  }

  return {
    apiBaseUrl: apiBaseUrl.trim().replace(/\/$/, "")
  };
}

async function runConnect({
  args,
  cwd,
  env,
  stderr,
  stdout,
  fetchImplementation,
  readApiKey
}: {
  args: ConnectArgs;
  cwd: string;
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
  fetchImplementation?: typeof fetch;
  readApiKey?: () => Promise<string>;
}): Promise<number> {
  const ui = createCliUi(stdout, stderr);
  ui.title("Barkan Connect");

  const existingConnection = await readConnection(cwd, env);
  if (existingConnection) {
    const apiBaseUrl = args.apiBaseUrl || existingConnection.apiBaseUrl;
    let validatedConnection: typeof existingConnection | null = null;
    try {
      validatedConnection = await validateSavedConnection({
        connection: existingConnection,
        cwd,
        env,
        apiBaseUrl,
        fetchImplementation
      });
    } catch (error) {
      if (!(error instanceof SavedApiKeyInvalidError)) {
        throw error;
      }

      ui.muted("Saved Barkan API key is no longer valid.");
    }

    if (!validatedConnection) {
      ui.muted("Paste the CLI API key from your site detail panel.");
    } else {
      ui.success("Already connected to Barkan");
      await ensureProjectConfig(cwd, validatedConnection);
      await startLocalAgent(cwd, env);
      ui.table([
        ["Account", validatedConnection.user.email],
        ["Site", validatedConnection.site ? `${validatedConnection.site.name} (${validatedConnection.site.domain})` : null],
        ["Project", validatedConnection.project ? `${validatedConnection.project.name} (${validatedConnection.project.id})` : null],
        ["API", validatedConnection.apiBaseUrl]
      ]);
      return 0;
    }
  } else {
    ui.muted("Paste the CLI API key from your site detail panel.");
  }

  const apiKey = (await (readApiKey ? readApiKey() : readApiKeyFromPrompt())).trim();
  if (!apiKey) {
    throw new CliUsageError("Missing API key.");
  }

  ui.step("Checking API key");

  const response = await connectToBarkan({
    apiKey,
    apiBaseUrl: args.apiBaseUrl,
    fetchImplementation
  });
  const existingConfig = await readExistingBarkanConfig(cwd);
  if (existingConfig && existingConfig.project_id !== response.project.id) {
    throw new CliUsageError(
      `This project is configured for ${existingConfig.project_id}, but the API key is for ${response.project.id}. Use this project's API key or update barkan.config.json.`
    );
  }

  const connection: BarkanConnection = {
    apiKey,
    apiBaseUrl: args.apiBaseUrl,
    user: response.user,
    site: response.site,
    project: response.project,
    connectedAt: new Date().toISOString()
  };
  await writeConnection(connection, cwd, env);
  await ensureProjectConfig(cwd, connection);
  await startLocalAgent(cwd, env);

  ui.success("Connected to Barkan");
  ui.table([
    ["Account", response.user.email],
    ["Site", response.site ? `${response.site.name} (${response.site.domain})` : null],
    ["Project", `${response.project.name} (${response.project.id})`],
    ["API", args.apiBaseUrl]
  ]);

  return 0;
}

async function runDisconnect({
  cwd,
  env,
  stderr,
  stdout
}: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}): Promise<number> {
  const ui = createCliUi(stdout, stderr);
  ui.title("Barkan Disconnect");

  const connection = await readConnection(cwd, env);
  await stopLocalAgent(cwd, env);
  const didRemoveConnection = await removeConnection(cwd, env);
  const didRemoveProjectFiles = await removeBarkanProjectFiles(cwd);

  if (didRemoveConnection || didRemoveProjectFiles || connection) {
    ui.success("Disconnected from Barkan");
  } else {
    ui.muted("No Barkan connection found.");
  }
  return 0;
}

async function runStatus({
  cwd,
  env,
  stderr,
  stdout,
  title,
  fetchImplementation
}: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
  title: string;
  fetchImplementation?: typeof fetch;
}): Promise<number> {
  const ui = createCliUi(stdout, stderr);
  ui.title(title);

  const savedConnection = await readConnection(cwd, env);
  const connection = savedConnection
    ? await validateSavedConnection({
        connection: savedConnection,
        cwd,
        env,
        fetchImplementation
      })
    : null;
  if (!connection) {
    ui.error("Not connected to Barkan");
    ui.next(["barkan connect"]);
    return 1;
  }

  let agentStatus = "unknown";
  try {
    const response = await getBarkanAgentStatus({
      apiKey: connection.apiKey,
      apiBaseUrl: connection.apiBaseUrl,
      fetchImplementation
    });
    agentStatus = response.agent.connected
      ? `connected${response.agent.connectedAt ? ` since ${response.agent.connectedAt}` : ""}`
      : "not connected";
  } catch {
    agentStatus = "unavailable";
  }

  ui.success("Connected to Barkan");
  ui.table([
    ["Account", connection.user.email],
    ["Site", connection.site ? `${connection.site.name} (${connection.site.domain})` : null],
    ["Project", connection.project ? `${connection.project.name} (${connection.project.id})` : null],
    ["Local agent", agentStatus],
    ["API", connection.apiBaseUrl]
  ]);

  return 0;
}

async function ensureProjectConfig(cwd: string, connection: BarkanConnection): Promise<void> {
  if (!connection.project) {
    throw new CliUsageError("Barkan connection has no project. Run `barkan disconnect`, then `barkan connect` again.");
  }

  const existingConfig = await readExistingBarkanConfig(cwd);
  if (existingConfig && existingConfig.project_id !== connection.project.id) {
    throw new CliUsageError(
      `This project is configured for ${existingConfig.project_id}, but the API key is for ${connection.project.id}. Use this project's API key or update barkan.config.json.`
    );
  }

  if (!existingConfig) {
    await writeBarkanConfig(cwd, connection.project.id);
  }
}

function parseAgentArgs(args: string[], fallbackCwd: string): string {
  let agentCwd = fallbackCwd;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cwd") {
      agentCwd = readFlagValue(args, index, "--cwd");
      index += 1;
      continue;
    }

    if (arg.startsWith("--cwd=")) {
      agentCwd = arg.slice("--cwd=".length);
      continue;
    }
  }

  return agentCwd;
}

async function readApiKeyFromPrompt(): Promise<string> {
  if (!processStdin.isTTY) {
    throw new CliUsageError("Cannot prompt for an API key in this terminal. Run `barkan connect` from an interactive terminal.");
  }

  if (typeof processStdin.setRawMode === "function") {
    return readHiddenLine("Barkan API key: ");
  }

  const prompt = readline.createInterface({
    input: processStdin,
    output: process.stdout
  });

  try {
    return await prompt.question("Barkan API key: ");
  } finally {
    prompt.close();
  }
}

function readHiddenLine(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = processStdin;
    const wasRaw = input.isRaw;
    const characters: string[] = [];

    function cleanup() {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      process.stdout.write("\n");
    }

    function onData(data: Buffer) {
      for (const byte of data) {
        if (byte === 3) {
          cleanup();
          reject(new CliUsageError("Cancelled."));
          return;
        }

        if (byte === 13 || byte === 10) {
          cleanup();
          resolve(characters.join(""));
          return;
        }

        if (byte === 127 || byte === 8) {
          characters.pop();
          continue;
        }

        if (byte >= 32) {
          characters.push(String.fromCharCode(byte));
        }
      }
    }

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function readFlagValue(args: string[], index: number, flagName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`Missing value for ${flagName}.`);
  }

  return value;
}

function getHelpText(): string {
  return [
    "Barkan CLI",
    "",
    "Usage:",
    "  barkan connect",
    "  barkan disconnect",
    "  barkan status",
    "",
    "Environment:",
    "  BARKAN_API_URL   Barkan API base URL (defaults to http://localhost:4000)"
  ].join("\n");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function validateSavedConnection({
  connection,
  cwd,
  env,
  apiBaseUrl = connection.apiBaseUrl,
  fetchImplementation
}: {
  connection: NonNullable<Awaited<ReturnType<typeof readConnection>>>;
  cwd: string;
  env: NodeJS.ProcessEnv;
  apiBaseUrl?: string;
  fetchImplementation?: typeof fetch;
}): Promise<NonNullable<Awaited<ReturnType<typeof readConnection>>>> {
  const resolvedApiBaseUrl = apiBaseUrl ?? connection.apiBaseUrl;
  try {
    const response = await connectToBarkan({
      apiKey: connection.apiKey,
      apiBaseUrl: resolvedApiBaseUrl,
      fetchImplementation
    });
    const validatedConnection = {
      ...connection,
      apiBaseUrl: resolvedApiBaseUrl,
      user: response.user,
      site: response.site,
      project: response.project
    };
    await writeConnection(validatedConnection, cwd, env);
    return validatedConnection;
  } catch (error) {
    if (isInvalidSavedApiKeyError(error)) {
      await removeConnection(cwd, env);
      throw new SavedApiKeyInvalidError("Saved Barkan API key is no longer valid. Run `barkan connect` again.");
    }

    throw error;
  }
}

function isInvalidSavedApiKeyError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("invalid api key") || message.includes("api key required");
}

class CliUsageError extends Error {}

class SavedApiKeyInvalidError extends CliUsageError {}
