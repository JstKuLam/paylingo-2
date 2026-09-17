<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:shadcn-lint-rules -->
# Design System & Styling Rules (@shadcn/lint)

The project enforces Tailwind v4 design system rules via `@shadcn/lint`.
Whenever creating, modifying, or refactoring UI components or pages:
1. **Never restyle core components**: Components (like `<Button>`, `<Card>`, etc.) own their internal sizing, padding, and shape. Use variants/props (e.g. `size="sm" | "lg"`, `variant="outline"`) instead of overriding with classes like `p-*`, `h-*`, or `rounded-*`.
2. **No arbitrary values**: Do not use arbitrary Tailwind values like `h-[48px]`, `p-[13px]`, or `w-[320px]`. Always use standard scale values (e.g. `h-12`, `p-3`, `w-80`).
3. **No raw/undeclared colors**: Use declared theme color tokens from `src/app/globals.css` (e.g. `bg-primary`, `text-muted-foreground`, `border-border`, etc.) instead of undeclared colors or hardcoded hex values.
4. **Self-Verification**: After writing UI code, run `npx eslint <file>` or check linter output to ensure zero `@shadcn/lint` violations before declaring task completion.
<!-- END:shadcn-lint-rules -->

