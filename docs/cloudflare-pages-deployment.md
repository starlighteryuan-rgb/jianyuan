# 见渊（Personal Awareness）· Cloudflare Pages Deployment Preparation

## Current status

The demo is buildable as a Next.js App Router project. A previous competition
demo release has already been deployed to Cloudflare Pages, and Wrangler OAuth
authentication is available on the local machine.

The current local release contains the final 见渊（Personal Awareness）branding
and presentation updates. It has passed local type checking, automated tests,
and a production build, but this updated release has not been deployed yet.

The competition-visible routes `/`, `/capture`, `/references`, and
`/reflection` are generated as static pages. The existing dynamic
`/reflect/[targetRef]` and `/settings` routes remain outside the visible
competition navigation.

## Manual deployment path

1. Complete the final local visual review and obtain release approval.
2. Reuse the existing authenticated Wrangler session and established Pages
   project. Do not request a second OAuth login unless Cloudflare explicitly
   reports that the existing session is no longer valid.
3. Deploy the verified competition artifact with the previously successful
   Pages workflow. Do not add `DATABASE_URL`, a Zhihu Access Secret, or any
   model credential to the public demo.
4. Verify `/`, `/capture`, `/references`, `/reflection`, metadata, and the
   Liukanshan character assets on the preview URL.
5. Promote the same verified artifact only after the preview check passes.

## Safety checks

- No secrets are committed by the demo changes.
- The Liukanshan files are static presentation assets only.
- The demo Agent controls are local preset state switches; they do not call an
  Agent, model, tool, database, or autonomous workflow.
- Domain, Application, Ingestion, External Reference semantics, Zhihu adapter,
  Evidence identity, `sourceFingerprint`, Relation/Hypothesis logic, and Prisma
  schema remain outside the demo changes.

## Manual actions still required

- Approve the final local branding and presentation.
- Deploy the current release to the existing Cloudflare Pages project using
  the existing Wrangler authentication.
- Run a public smoke test over the four competition-visible routes and static
  character assets.
