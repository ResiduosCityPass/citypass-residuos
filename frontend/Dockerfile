# Imagen del frontend del modulo de Residuos.
#
# Multi-stage: Vite compila una SPA estatica; nginx solo sirve los archivos ya
# generados. Las variables VITE_* se inyectan en build time.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL=http://localhost:3000/api/v1
ARG VITE_USE_MOCKS=false
ARG VITE_SIMULAR_GPS=false

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_USE_MOCKS=$VITE_USE_MOCKS
ENV VITE_SIMULAR_GPS=$VITE_SIMULAR_GPS

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------- runtime
FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
