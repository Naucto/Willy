COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f docker-compose.yml -f docker-compose.local.yml

.PHONY: help install dev-setup dev down logs build test lint lint-fix typecheck e2e

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	npm install

dev-setup: ## Generate local .env + TLS cert if missing
	./scripts/dev-setup.sh

dev: dev-setup ## Run the full stack locally (https://willy.localhost)
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

e2e: ## Run Playwright e2e against the local stack (Phase 4+)
	@echo "e2e suite lands with the dashboard in Phase 4"
