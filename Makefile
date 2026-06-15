COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f docker-compose.yml -f docker-compose.local.yml

.PHONY: help install dev_setup dev down logs build test lint lint-fix typecheck e2e

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	npm install

dev_setup: ## Generate local .env + TLS cert if missing
	./scripts/dev_setup.sh

dev: dev_setup ## Run the full stack locally (https://willy.localhost)
	$(COMPOSE_DEV) up --build

down: ## Stop the local stack
	$(COMPOSE_DEV) down

logs: ## Tail local stack logs
	$(COMPOSE_DEV) logs -f

build: ## Build all images
	$(COMPOSE) build

test: ## Run unit/integration tests (Vitest) across workspaces
	npm run test

lint: ## Lint + format check (Biome)
	npm run lint

lint-fix: ## Apply lint/format fixes (Biome)
	npm run lint:fix

typecheck: ## Type-check all workspaces
	npm run typecheck

e2e: ## Run Playwright e2e against the local stack (needs `make dev` running + `npx playwright install`)
	npm run e2e -w @willy/frontend
