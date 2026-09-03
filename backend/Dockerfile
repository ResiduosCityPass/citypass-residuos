# Imagen del backend del modulo de Residuos.
#
# Multi-stage: la etapa de build necesita las devDependencies y el compilador de
# TypeScript; la imagen final no. Copiar el node_modules completo sumaria unos
# 400 MB de herramientas que nunca corren en produccion, y ampliaria la
# superficie de ataque sin ningun beneficio.
#
#   docker build -t citypass-residuos-api ./backend
#   docker run --env-file backend/.env -p 3000:3000 citypass-residuos-api

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build

WORKDIR /app

# Se copian primero los manifiestos: mientras no cambien, Docker reutiliza la
# capa de dependencias y no reinstala en cada build.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# Se reinstalan solo las dependencias de produccion, para copiarlas limpias a la
# imagen final.
RUN npm ci --omit=dev

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

# `dumb-init` como PID 1: sin el, Node no recibe SIGTERM y el contenedor se
# mata a la fuerza a los 10 segundos. Eso corta el despachador del outbox en
# medio de un lote en vez de dejarlo cerrar.
RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# La imagen de Node trae el usuario `node` sin privilegios. Correr como root es
# innecesario y es de lo primero que mira cualquier revision de seguridad.
USER node

EXPOSE 3000

# El health de la aplicacion es publico a proposito (ADR-005): lo consultan el
# orquestador y el pipeline, que no tienen credenciales de usuario.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
