CREATE TYPE "inventory_category" AS ENUM('kjokken', 'sengetoy', 'handklar', 'puter-utemobler', 'kluter');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" serial PRIMARY KEY,
	"browser_id" varchar(64) NOT NULL,
	"category" "inventory_category" NOT NULL,
	"name" varchar(120) NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "inventory_items_quantity_range" CHECK ("quantity" between 1 and 999999)
);
--> statement-breakpoint
CREATE INDEX "inventory_items_browser_id_idx" ON "inventory_items" ("browser_id","id");