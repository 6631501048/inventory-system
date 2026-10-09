-- ============================================================
-- Inventory Management System - PostgreSQL schema
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id             SERIAL PRIMARY KEY,
    category_id    INTEGER       NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name           VARCHAR(200)  NOT NULL,
    sku            VARCHAR(50)   NOT NULL UNIQUE,
    cost_price     NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
    stock_quantity INTEGER       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_stock    ON products(stock_quantity);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id           BIGSERIAL PRIMARY KEY,
    product_id   INTEGER      NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    type         VARCHAR(3)   NOT NULL CHECK (type IN ('IN', 'OUT')),
    quantity     INTEGER      NOT NULL CHECK (quantity > 0),
    stock_before INTEGER      NOT NULL CHECK (stock_before >= 0),
    stock_after  INTEGER      NOT NULL CHECK (stock_after >= 0),
    reason       VARCHAR(255),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_tx_product_id_desc
    ON stock_transactions(product_id, id DESC);

-- ข้อมูลตั้งต้น
INSERT INTO categories (name, description) VALUES
    ('IT', 'อุปกรณ์ไอทีและคอมพิวเตอร์'),
    ('Office Supply', 'เครื่องเขียนและอุปกรณ์สำนักงาน'),
    ('Furniture', 'เฟอร์นิเจอร์')
ON CONFLICT (name) DO NOTHING;