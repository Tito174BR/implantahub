.PHONY: up down logs migrate seed test

up:
	docker compose up --build

down:
	docker compose down -v

logs:
	docker compose logs -f api worker web

migrate:
	docker compose exec api pnpm db:migrate

seed:
	docker compose exec api pnpm db:seed

test:
	docker compose exec api pnpm test
