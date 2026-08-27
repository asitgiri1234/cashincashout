ALTER TABLE "product_images" ADD COLUMN "pathname" text;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_pathname_idx" ON "product_images" USING btree ("pathname");