# NitroStack MCP Server Best Practices — Hackathon Reference

> This guide is derived **strictly** from the example servers in the NitroStack repo at `/Users/anshu/repo/nitrostack` (the canonical CLI templates under `typescript/packages/cli/templates/` plus the 62+ `sample-apps/`). It is meant to be a quick, ground-truth reference for bootstrapping a compliant MCP server under hackathon time pressure.

---

## 1. Project Structure

### 1.1 Canonical starter layout

The NitroStack TypeScript starter pack expects this folder/file shape (confirmed by `typescript/packages/cli/templates/typescript-starter/`):

```text
my-server/
├── package.json              # type: "module", scripts use nitrostack-cli
├── tsconfig.json
├── .env                      # loaded by `import 'dotenv/config'`
├── .env.example              # shipped baseline
├── src/
│   ├── index.ts              # bootstrap entry point
│   ├── app.module.ts         # root @McpApp + @Module
│   ├── health/
│   │   └── system.health.ts  # optional but standard
│   ├── modules/
│   │   └── <domain>/
│   │       ├── <domain>.module.ts
│   │       ├── <domain>.tools.ts
│   │       ├── <domain>.resources.ts   # optional
│   │       ├── <domain>.prompts.ts     # optional
│   │       └── <domain>.service.ts     # optional
│   └── widgets/              # optional widget preview app
│       ├── app/
│       │   ├── layout.tsx
│       │   └── <widget-route>/page.tsx
│       ├── package.json
│       ├── tsconfig.json
│       └── widget-manifest.json
```

### 1.2 How the pieces wire together

1. **`src/index.ts`** — loads `.env`, creates the app via `McpApplicationFactory.create(AppModule)`, and calls `server.start()`.
2. **`src/app.module.ts`** — carries the `@McpApp` decorator (server name/version/logging) and the root `@Module` decorator (imports feature modules and providers such as health checks).
3. **Feature modules** — each `src/modules/<domain>/<domain>.module.ts` is a `@Module({ controllers: [...], providers: [...] })` that imports the classes containing `@Tool`, `@Resource`, and `@Prompt` methods.
4. **The framework** — not the developer — calls the underlying MCP SDK `server.tool()` / `server.resource()` / `server.prompt()` by scanning the decorators and `controllers` array (`typescript/packages/core/src/core/app-decorator.ts`).

**Important:** there is **no directory auto-discovery**. A new handler must be:
- imported into its feature module,
- added to that module's `controllers` array,
- and that module must be imported by `AppModule`.

### 1.3 Inconsistencies observed across examples

- Some sample apps do not follow the `src/app.module.ts` convention:
  - `sample-apps/cloudguard-ai/src/index.ts` defines the root module inline.
  - `sample-apps/escalation-triage-mcp/src/index.ts` defines both `AppModule` and a separate `EscalationTriageApp`.
  - `sample-apps/trustlayer-ai-mcp-server-project/trustlayer-ai/src/index.ts` points to `trust-layer.module.ts` instead of `app.module.ts`.
  - `sample-apps/relink-mcp/src/index.ts` and `src/main.ts` drift: `package.json` starts `dist/index.js`, while other scripts use `dist/main.js`.
- A few projects (`sample-apps/HealthBridgeMCP`, `sample-apps/SUMO-AI-MCP`) also include runnable Python FastMCP servers alongside the NitroStack TypeScript implementation. They are ports/demos, not the starter convention.

---

## 2. Naming Conventions

### 2.1 Files and folders

- **Entry point:** `src/index.ts` (nearly universal).
- **Root module:** `src/app.module.ts` (dominant; noted exceptions above).
- **Feature module:** `src/modules/<domain>/<domain>.module.ts`.
- **Tool class:** `<Domain>Tools` → `src/modules/<domain>/<domain>.tools.ts`.
- **Resource class:** `<Domain>Resources` → `src/modules/<domain>/<domain>.resources.ts`.
- **Prompt class:** `<Domain>Prompts` → `src/modules/<domain>/<domain>.prompts.ts`.
- **Service class:** `<Domain>Service` → `src/modules/<domain>/<domain>.service.ts`.
- **Health check:** `src/health/system.health.ts` exporting `SystemHealthCheck`.

### 2.2 Tool / resource / prompt names

- **Tool names:** The dominant pattern is **lower `snake_case`**. Examples from the starter and most sample apps:
  - `calculate`, `convert_temperature`
  - `search_flights`, `get_flight_details`, `create_order`
  - `show_pizza_map`, `show_pizza_list`, `show_pizza_shop`
- **Exceptions / inconsistencies observed:**
  - camelCase: `analyseReceipt`, `createResolutionPlan` (`sample-apps/Rightly`), `getUnifiedInbox` (`sample-apps/Converra-One`).
  - hyphenated: `youtube-to-markdown` (`sample-apps/Markidian_mcp`), `find-hospital-options` (`sample-apps/Zerogravity`).
  - Some trustlayer tools use camelCase.
  - **Recommendation:** stick to `snake_case` to match the canonical starter and the majority of sample apps.
- **Resource URIs:** Use a stable scheme prefix, e.g. `calculator://operations`.
- **Prompt names:** Use `snake_case`, e.g. `calculator_help`.

### 2.3 Config keys and environment variables

Common env keys seen across examples (no single required set; copy `.env.example`):

```env
NITRO_LOG_LEVEL=info
NITROSTACK_APP_MODE=universal
MCP_TRANSPORT_TYPE=stdio|http|dual   # optional; defaults depend on NODE_ENV
PORT=3000
HOST=localhost
ENABLE_CORS=true
```

OAuth-enabled examples add:

```env
RESOURCE_URI=https://mcplocal
AUTH_SERVER_URL=https://dev-xxx.us.auth0.com
TOKEN_AUDIENCE=https://mcplocal
TOKEN_ISSUER=https://dev-xxx.us.auth0.com/
OAUTH_REQUIRED=true
```

Domain-specific API keys are read directly in services, e.g. `process.env.DUFFEL_API_KEY`.

---

## 3. Tool Definition Patterns

### 3.1 Minimal working example

From `typescript/packages/cli/templates/typescript-starter/src/modules/calculator/calculator.tools.ts`:

```typescript
import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';

export class CalculatorTools {
  @Tool({
    name: 'calculate',
    description: 'Perform basic arithmetic calculations',
    inputSchema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The operation to perform'),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number')
    }),
    examples: {
      request: { operation: 'add', a: 5, b: 3 },
      response: { operation: 'add', a: 5, b: 3, result: 8, expression: '5 + 3 = 8' }
    }
  })
  async calculate(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Performing calculation', { operation: input.operation, a: input.a, b: input.b });

    let result: number;
    let symbol: string;

    switch (input.operation) {
      case 'add': result = input.a + input.b; symbol = '+'; break;
      case 'subtract': result = input.a - input.b; symbol = '-'; break;
      case 'multiply': result = input.a * input.b; symbol = '×'; break;
      case 'divide':
        if (input.b === 0) throw new Error('Cannot divide by zero');
        result = input.a / input.b; symbol = '÷'; break;
      default: throw new Error('Invalid operation');
    }

    return {
      operation: input.operation,
      a: input.a,
      b: input.b,
      result,
      expression: `${input.a} ${symbol} ${input.b} = ${result}`
    };
  }
}
```

Then register it in the feature module:

```typescript
// src/modules/calculator/calculator.module.ts
import { Module } from '@nitrostack/core';
import { CalculatorTools } from './calculator.tools.js';

@Module({
  name: 'calculator',
  description: 'Basic arithmetic calculator',
  controllers: [CalculatorTools]
})
export class CalculatorModule {}
```

And import the module in the root:

```typescript
// src/app.module.ts
import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { CalculatorModule } from './modules/calculator/calculator.module.js';

@McpApp({
  module: AppModule,
  server: { name: 'calculator-server', version: '1.0.0' },
  logging: { level: 'info' }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [ConfigModule.forRoot(), CalculatorModule]
})
export class AppModule {}
```

### 3.2 Tool decorator rules of thumb

- **Schema:** always use `z.object(...)` with `.describe()` on every field. The framework exposes this as the MCP input schema.
- **Examples:** include `examples: { request: {...}, response: {...} }` to help Studio/Claude understand the shape.
- **Method signature:** `async myTool(input: any, ctx: ExecutionContext)` is the standard.
- **Logging:** use `ctx.logger.info(...)` / `ctx.logger.error(...)` for observability.
- **Widgets:** attach `@Widget('route-name')` to return a widget-renderable payload when the tool is meant to drive UI.
- **Guards:** attach `@UseGuards(OAuthGuard)` or `@UseGuards(ApiKeyGuard)` above the method for protected endpoints.
- **Rate limits / cache:** optional decorators like `@RateLimit(...)`, `@Cache(...)` appear in some sample apps (e.g. `relink-mcp`, `Artha`).

### 3.3 Service injection pattern

When a tool needs a service, use the `@Injectable` + constructor pattern with explicit deps for ESM compatibility:

```typescript
import { ToolDecorator as Tool, ExecutionContext, Injectable } from '@nitrostack/core';
import { MyService } from './my.service.js';

@Injectable({ deps: [MyService] })
export class MyTools {
  constructor(private readonly myService: MyService) {}

  @Tool({ name: 'do_thing', ... })
  async doThing(input: any, ctx: ExecutionContext) { ... }
}
```

This explicit `deps` array is repeatedly recommended in comments across the examples (e.g. `typescript-oauth/flights.tools.ts`, `booking.tools.ts`, `pizzaz.tools.ts`).

---

## 4. Error Handling

### 4.1 Dominant pattern: throw plain `Error`

The vast majority of examples simply throw:

```typescript
if (input.b === 0) {
  throw new Error('Cannot divide by zero');
}
```

And the bootstrap catches fatal startup errors:

```typescript
bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
```

This is the **starter-approved default**.

### 4.2 Alternative patterns observed (note: inconsistent)

Only a few examples define explicit exception filters or return structured errors:

- `sample-apps/Artha-Live-Data-Finance-Tax-Copilot/src/common/exception.filter.ts` returns:
  ```typescript
  return { isError: true, error: message, tool: context.toolName, timestamp: ... };
  ```
- `sample-apps/Markidian_mcp/src/server.ts` returns native MCP content with `isError: true`:
  ```typescript
  return { content: [{ type: "text", text: ... }], isError: true };
  ```
- `sample-apps/continuum-forge/src/modules/validation/validation.tools.ts` returns an application envelope:
  ```typescript
  return { success: false, error: "Invalid rule..." };
  ```

### 4.3 Practical guidance

- **For a hackathon:** follow the starter and just `throw new Error('human-readable message')` for validation/business failures. The framework will surface it to the client.
- **If you need structured error payloads:** pick one of the three patterns above and use it consistently within your app. Do not mix `throw` and `{ success: false }` on adjacent tools unless you have a reason.
- **Service-level errors:** log via `ctx.logger.error(...)` before re-throwing or transforming, so server logs remain useful.

---

## 5. Config & Environment Setup

### 5.1 Required files

- **`.env`** (or `.env.example` to copy from) — read by `import 'dotenv/config'` at the top of `src/index.ts`.
- **`src/app.module.ts`** — `ConfigModule.forRoot()` is imported in almost every example to merge `.env` into `process.env`.
- **No server manifest file.** The canonical starter does not use `nitrostack.config.ts` or `nitrostack.json` for server identity/transport/tool registration.
  - The **only** manifest in the starter is `src/widgets/widget-manifest.json`, which is purely for widget preview routes in Studio.
  - Some `sample-apps` contain their own `nitrostack.config.ts` or `nitrostack.json`, but these are app-specific and not parsed by the canonical starter framework.

### 5.2 Transport selection

From `typescript/packages/core/src/core/server.ts`:

- `MCP_TRANSPORT_TYPE` can be `stdio`, `http`, or `dual`.
- If `MCP_TRANSPORT_TYPE` is unset, `NODE_ENV` drives the default:
  - `development`, `dev`, or unset → **stdio**.
  - any other value → **dual** (stdio + HTTP).
- HTTP transport uses:
  - `PORT` (default `3000`)
  - `HOST` (default `localhost`)
  - `ENABLE_CORS` (default true; set `false` to disable)

### 5.3 How the server registers itself

The server does not "register" with a registry. It exposes the MCP protocol over the chosen transport(s):

```typescript
import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);
  await server.start();
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
```

Clients (Claude, Studio, etc.) connect via stdio or the HTTP/SSE endpoint.

### 5.4 Starter `.env.example` baseline

```env
NITRO_LOG_LEVEL=info
NITROSTACK_APP_MODE=universal
# MCP_TRANSPORT_TYPE=stdio|http|dual
# PORT=3000
# HOST=localhost
# ENABLE_CORS=true
```

---

## 6. Do's and Don'ts

### ✅ Do this

- **Do** use `import 'dotenv/config';` as the very first line of `src/index.ts`.
- **Do** use the `@Module` / `@McpApp` / decorator-driven registration pattern rather than manually calling the MCP SDK.
- **Do** put `@Tool`, `@Resource`, and `@Prompt` classes into a feature module's `controllers` array.
- **Do** import feature modules into the root `AppModule`.
- **Do** use `.js` extensions in TypeScript imports when `"type": "module"` (the starter uses this ESM convention everywhere).
- **Do** use `z.object(...)` with `.describe()` for tool input schemas.
- **Do** add `examples` to your `@Tool` definitions.
- **Do** use `ctx.logger.info|error|debug(...)` for runtime logging.
- **Do** use `snake_case` tool names to match the starter and most examples.
- **Do** use `@Injectable({ deps: [MyService] })` with explicit dependencies for ESM-safe DI.
- **Do** add a `SystemHealthCheck` provider in `src/health/system.health.ts` if you want health monitoring.
- **Do** copy the starter's `package.json` scripts (`dev`, `build`, `start`, `start:prod`, `upgrade`, `install:all`).
- **Do** use `npm run dev` for local development with Studio.

### ❌ Don't do this

- **Don't** create a `src/modules/<domain>/` folder and expect the framework to auto-discover it. You must import and register every class.
- **Don't** mix tool-name casing styles (`snake_case`, `camelCase`, `kebab-case`) within one server unless you have a strong reason.
- **Don't** rely on `nitrostack.config.ts` or `nitrostack.json` for server registration/transport in the canonical starter — the framework does not load them.
- **Don't** call `console.log` to stdout in a tool that may run under stdio transport; use `ctx.logger` (which writes to stderr) or risk corrupting the MCP protocol stream.
- **Don't** forget `.js` extensions on relative imports; ESM will break at runtime.
- **Don't** return inconsistent error shapes across tools; pick one pattern and document it.
- **Don't** hard-code secrets in source; read them from `process.env` via `ConfigService` or directly.
- **Don't** assume HTTP is the default in development; it is **stdio** unless you set `MCP_TRANSPORT_TYPE=http|dual`.

---

## 7. Common Gotchas

1. **ESM import extensions.** The starter uses `"type": "module"` and `tsconfig.json` emits ES2022. Relative imports **must** use `.js` even though the source file is `.ts` (e.g. `import { AppModule } from './app.module.js';`). Several examples break this rule and only work because of their own bundler setup; the starter does not.

2. **No auto-discovery.** It is easy to write a new tool class, add it to the folder, and forget to import it into the module's `controllers` array. If a tool is missing in Studio/Claude, check the module wiring first.

3. **Transport confusion.** `NODE_ENV=development` → stdio only. If you want to hit HTTP endpoints locally, set `MCP_TRANSPORT_TYPE=http` or `dual` in `.env`.

4. **Widget manifest location.** If you add widgets, the framework expects `src/widgets/widget-manifest.json` at the project root's working directory. Moving it elsewhere will break Studio preview.

5. **OAuth `TOKEN_ISSUER` trailing slash.** The OAuth template examples (`typescript-oauth`, `sample-apps/relink-mcp`) repeatedly note that Auth0 issuer URLs must end with `/` (e.g. `https://dev-xxx.us.auth0.com/`). Missing the slash causes validation failures.

6. **Audience/exact URI matching.** `RESOURCE_URI` must match the Auth0 API Identifier **exactly**, case-sensitive. This is called out as a top failure mode in `typescript-oauth/OAUTH_SETUP.md`.

7. **ID Token encryption.** For OAuth, Auth0 Application → Advanced → ID Token encryption must be **disabled**. If enabled, you get JWE tokens and validation fails.

8. **OAuth application type.** Use **Regular Web Application**, not SPA or Machine-to-Machine, for Studio/OpenAI Apps compatibility.

9. **Duplicate / vendored implementations.** `sample-apps/converge/` and `sample-apps/logic-loop-mcp-server-project/` contain embedded copies of other sample apps and CLI templates. Treat them as noise, not independent patterns.

10. **Unregistered tool classes.** In `sample-apps/cloudguard-ai`, several `*.tools.ts` files exist under `src/modules/` but the inline root module only registers `CloudGuardTools`. If you copy from sample apps, verify the module actually imports the class.

11. **Entry point drift.** A few sample apps use `main.ts` instead of `index.ts`, or have multiple entry scripts. The starter convention is `src/index.ts`.

12. **`@McpApp({ module: AppModule })` must point at the root `@Module` class.** A few examples (e.g. `HealthBridgeMCP/src/app.module.ts`) point `module` at another feature module, which is unusual and not the starter convention.

---

## 8. Minimal "Hello World" Checklist

Use this to bootstrap a working, spec-compliant MCP server in the next 10 minutes.

### Step 1 — scaffold

```bash
npx @nitrostack/cli init my-server --template typescript-starter
cd my-server
npm install
```

### Step 2 — keep the starter files

Make sure you have:

- `src/index.ts` (bootstrap)
- `src/app.module.ts` (root `@McpApp` + `@Module`)
- `src/modules/hello/hello.module.ts`
- `src/modules/hello/hello.tools.ts`
- `src/health/system.health.ts` (optional but recommended)
- `.env.example` (copy to `.env`)

### Step 3 — write one tool

In `src/modules/hello/hello.tools.ts`:

```typescript
import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';

export class HelloTools {
  @Tool({
    name: 'say_hello',
    description: 'Greet a user by name',
    inputSchema: z.object({
      name: z.string().describe('Name to greet')
    }),
    examples: {
      request: { name: 'Alice' },
      response: { greeting: 'Hello, Alice!' }
    }
  })
  async sayHello(input: any, ctx: ExecutionContext) {
    ctx.logger.info('Saying hello', { name: input.name });
    return { greeting: `Hello, ${input.name}!` };
  }
}
```

### Step 4 — register the module

In `src/modules/hello/hello.module.ts`:

```typescript
import { Module } from '@nitrostack/core';
import { HelloTools } from './hello.tools.js';

@Module({
  name: 'hello',
  description: 'Hello world demo',
  controllers: [HelloTools]
})
export class HelloModule {}
```

### Step 5 — import in root

In `src/app.module.ts`:

```typescript
import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { HelloModule } from './modules/hello/hello.module.js';

@McpApp({
  module: AppModule,
  server: { name: 'hello-server', version: '1.0.0' },
  logging: { level: 'info' }
})
@Module({
  name: 'app',
  description: 'Hello world MCP server',
  imports: [ConfigModule.forRoot(), HelloModule]
})
export class AppModule {}
```

### Step 6 — run

```bash
npm run dev
```

Connect with **NitroStudio** or any MCP client. In dev mode the server speaks **stdio** by default.

### Step 7 — verify

- Server starts without errors.
- Client lists `say_hello` as an available tool.
- Calling `say_hello` with `{ "name": "Alice" }` returns `{ "greeting": "Hello, Alice!" }`.

---

## 9. Where to Look for Ground Truth

- **Canonical starter code:** `typescript/packages/cli/templates/typescript-starter/`
- **OAuth starter code:** `typescript/packages/cli/templates/typescript-oauth/`
- **Widget/example starter:** `typescript/packages/cli/templates/typescript-pizzaz/`
- **Official docs:** `docs/sdk/typescript/03-server-concepts.md`, `docs/sdk/typescript/04-tools-guide.md`, `docs/sdk/typescript/17-best-practices.md`
- **OAuth setup details:** `typescript/packages/cli/templates/typescript-oauth/OAUTH_SETUP.md`

---

*Last updated: based on repo state at `/Users/anshu/repo/nitrostack`. If you find an example that contradicts this guide, treat the canonical starter templates as the authoritative pattern and the sample-apps as illustrative (and sometimes heterogeneous) community submissions.*
