FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN pnpm install --frozen-lockfile --filter @mahalla/web...
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm --filter @mahalla/web build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /workspace/apps/web
COPY --from=build /workspace/apps/web/.next ./.next
COPY --from=build /workspace/apps/web/public ./public
COPY --from=build /workspace/apps/web/package.json ./package.json
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/web/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
