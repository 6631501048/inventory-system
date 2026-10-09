# Inventory Management API

REST API สำหรับจัดการคลังสินค้า: สินค้า, หมวดหมู่, การปรับสต็อก และประวัติรายการ

- **Base URL (local):** `http://localhost:3000`
- **รูปแบบข้อมูล:** JSON (UTF-8)
- **เวลา:** ISO 8601 (UTC) เช่น `2026-10-08T08:22:43.200Z`

## สารบัญ

1. [ข้อกำหนดทั่วไป](#ข้อกำหนดทั่วไป)
2. [Endpoint ทั้งหมด](#endpoint-ทั้งหมด)
3. [Products](#products) · [Stock](#stock) · [Categories](#categories) · [Health](#health)
4. [รหัส Error ทั้งหมด](#รหัส-error-ทั้งหมด)

---

## ข้อกำหนดทั่วไป

### Headers

| Header | ค่า | ใช้กับ |
|---|---|---|
| `Content-Type` | `application/json` | ทุก request ที่มี body (`POST`, `PATCH`) |
| `Accept` | `application/json` | ไม่บังคับ |

ยังไม่มีระบบ Authentication (ตามขอบเขตของโจทย์)

### รูปแบบ Response

**สำเร็จ:** ข้อมูลอยู่ใน `data` ส่วน list จะมี `meta` เพิ่มมาด้วย

```json
{ "data": { }, "meta": { } }
```

**ผิดพลาด:** รูปแบบเดียวกันทุก endpoint

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อความอธิบายภาษาไทย",
    "details": []
  }
}
```

`details` มีเฉพาะบาง error (รายการฟิลด์ที่ไม่ผ่านตรวจ หรือข้อมูลประกอบ) ให้ใช้ `code` ในการเขียนโปรแกรม ส่วน `message` ไว้แสดงผู้ใช้

### การแบ่งหน้า (Pagination)

Endpoint แบบ list ที่แบ่งหน้ารับ query ดังนี้

| Query | ค่าเริ่มต้น | ขอบเขต |
|---|---|---|
| `page` | `1` | 1 - 1,000,000 |
| `limit` | `20` | 1 - 100 |

`meta` ที่ตอบกลับ: `{ "page": 1, "limit": 20, "total": 45, "total_pages": 3 }`

---

## Endpoint ทั้งหมด

| Method | URL | หน้าที่ |
|---|---|---|
| `GET` | `/api/health` | ตรวจว่า API และฐานข้อมูลพร้อมใช้งาน |
| `POST` | `/api/products` | สร้างสินค้าใหม่ |
| `GET` | `/api/products` | รายการสินค้า (ค้นหา / กรอง / แบ่งหน้า) |
| `GET` | `/api/products/low-stock` | สินค้าใกล้หมด (คงเหลือน้อยกว่า 5) |
| `GET` | `/api/products/:id` | ดูสินค้ารายตัว |
| `GET` | `/api/products/:id/transactions` | ประวัติการเพิ่ม/ลดสต็อกของสินค้า |
| `PATCH` | `/api/stock/adjust` | ปรับสต็อก (+ เพิ่ม, - ลด) |
| `GET` | `/api/categories` | รายการหมวดหมู่ |
| `POST` | `/api/categories` | สร้างหมวดหมู่ |

---

## Products

### POST /api/products

สร้างสินค้าใหม่ ถ้าระบุ `stock_quantity` มากกว่า 0 ระบบจะบันทึกรายการ `IN` (เหตุผล `Initial stock`) ให้อัตโนมัติ เพื่อให้ประวัติรวมแล้วตรงกับยอดคงเหลือ

**Request Body**

| ฟิลด์ | ชนิด | บังคับ | เงื่อนไข |
|---|---|---|---|
| `name` | string | ใช่ | 1 - 200 ตัวอักษร (ตัดช่องว่างหน้า-หลัง) |
| `sku` | string | ใช่ | 1 - 50 ตัวอักษร ใช้ได้เฉพาะ `A-Z a-z 0-9 . _ -` ห้ามซ้ำ ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้ |
| `cost_price` | number | ใช่ | >= 0 ทศนิยมไม่เกิน 2 ตำแหน่ง |
| `category_id` | integer | ใช่ | ต้องเป็น id ของหมวดหมู่ที่มีอยู่ |
| `stock_quantity` | integer | ไม่ | >= 0 (ค่าเริ่มต้น `0`) |

```json
{
  "name": "Keyboard",
  "sku": "kb-001",
  "cost_price": 350.5,
  "category_id": 1,
  "stock_quantity": 10
}
```

**201 Created**

```json
{
  "data": {
    "id": 1,
    "category_id": 1,
    "name": "Keyboard",
    "sku": "KB-001",
    "cost_price": 350.5,
    "stock_quantity": 10,
    "created_at": "2026-10-08T08:22:43.200Z",
    "updated_at": "2026-10-08T08:22:43.200Z",
    "initial_transaction": {
      "id": 1,
      "product_id": 1,
      "type": "IN",
      "quantity": 10,
      "stock_before": 0,
      "stock_after": 10,
      "reason": "Initial stock",
      "created_at": "2026-10-08T08:22:43.200Z"
    }
  }
}
```

`initial_transaction` เป็น `null` ถ้าไม่ได้ระบุสต็อกเริ่มต้น

**400 VALIDATION_ERROR**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อมูลสินค้าไม่ถูกต้อง",
    "details": [
      { "field": "name", "message": "ต้องระบุชื่อสินค้า" },
      { "field": "sku", "message": "SKU ใช้ได้เฉพาะ A-Z, 0-9, จุด, ขีดกลาง และขีดล่าง" },
      { "field": "cost_price", "message": "ราคาทุนต้องเป็นตัวเลข >= 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง" }
    ]
  }
}
```

**400 CATEGORY_NOT_FOUND**

```json
{
  "error": {
    "code": "CATEGORY_NOT_FOUND",
    "message": "ไม่พบหมวดหมู่ id 99",
    "details": [{ "field": "category_id", "message": "ไม่พบหมวดหมู่นี้" }]
  }
}
```

**409 DUPLICATE_SKU**

```json
{
  "error": {
    "code": "DUPLICATE_SKU",
    "message": "SKU \"KB-001\" มีอยู่ในระบบแล้ว"
  }
}
```

**ตัวอย่าง**

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Keyboard","sku":"kb-001","cost_price":350.5,"category_id":1,"stock_quantity":10}'
```

---

### GET /api/products

รายการสินค้า เรียงจากใหม่ไปเก่า

**Query**

| Query | ชนิด | คำอธิบาย |
|---|---|---|
| `search` | string | ค้นหาจากชื่อหรือ SKU (ไม่สนตัวพิมพ์เล็ก/ใหญ่ ยาวไม่เกิน 100) |
| `category_id` | integer | กรองตามหมวดหมู่ |
| `page`, `limit` | integer | ดู [การแบ่งหน้า](#การแบ่งหน้า-pagination) |

**200 OK**

```json
{
  "data": [
    {
      "id": 2,
      "category_id": 2,
      "category_name": "Office Supply",
      "name": "A4 Paper",
      "sku": "PP-A4",
      "cost_price": 95.5,
      "stock_quantity": 50,
      "created_at": "2026-10-08T08:30:00.000Z",
      "updated_at": "2026-10-08T08:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
}
```

**400 VALIDATION_ERROR** เช่น `?page=0`, `?limit=101`, `?category_id=abc`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "limit ต้องอยู่ระหว่าง 1 ถึง 100",
    "details": [{ "field": "limit", "message": "limit ต้องอยู่ระหว่าง 1 ถึง 100" }]
  }
}
```

```bash
curl "http://localhost:3000/api/products?search=usb&category_id=1&page=1&limit=10"
```

---

### GET /api/products/low-stock

สินค้าที่คงเหลือ **น้อยกว่า** 5 ชิ้น เรียงจากเหลือน้อยสุดก่อน (ค่าเริ่มต้นตั้งได้ด้วย env `LOW_STOCK_THRESHOLD`) ไม่แบ่งหน้า

| Query | ชนิด | คำอธิบาย |
|---|---|---|
| `threshold` | integer | เปลี่ยนเกณฑ์เฉพาะคำขอนี้ (1 - 2147483647) |

**200 OK**

```json
{
  "data": [
    {
      "id": 1,
      "category_id": 1,
      "category_name": "IT",
      "name": "Keyboard",
      "sku": "KB-001",
      "cost_price": 350.5,
      "stock_quantity": 0,
      "created_at": "2026-10-08T08:22:43.200Z",
      "updated_at": "2026-10-08T08:25:10.000Z"
    }
  ],
  "meta": { "threshold": 5, "count": 1 }
}
```

**400 VALIDATION_ERROR** เมื่อ `threshold` ไม่ใช่จำนวนเต็มบวก

```bash
curl http://localhost:3000/api/products/low-stock
curl "http://localhost:3000/api/products/low-stock?threshold=10"
```

---

### GET /api/products/:id

**200 OK**

```json
{
  "data": {
    "id": 1,
    "category_id": 1,
    "category_name": "IT",
    "name": "Keyboard",
    "sku": "KB-001",
    "cost_price": 350.5,
    "stock_quantity": 15,
    "created_at": "2026-10-08T08:22:43.200Z",
    "updated_at": "2026-10-08T08:22:43.242Z"
  }
}
```

**400 VALIDATION_ERROR** เมื่อ `id` ไม่ใช่จำนวนเต็มบวก (เช่น `abc`, `0`, `1.5`, `-1`)

**404 NOT_FOUND**

```json
{
  "error": { "code": "NOT_FOUND", "message": "ไม่พบสินค้า id 999" }
}
```

---

### GET /api/products/:id/transactions

ประวัติการเพิ่ม/ลดสต็อกของสินค้า เรียงจากใหม่ไปเก่า แบ่งหน้าได้ (`page`, `limit`)

**200 OK**

```json
{
  "data": [
    {
      "id": 2,
      "product_id": 1,
      "type": "OUT",
      "quantity": 3,
      "stock_before": 15,
      "stock_after": 12,
      "reason": "ขายออก",
      "created_at": "2026-10-08T08:40:00.000Z"
    },
    {
      "id": 1,
      "product_id": 1,
      "type": "IN",
      "quantity": 15,
      "stock_before": 0,
      "stock_after": 15,
      "reason": "Initial stock",
      "created_at": "2026-10-08T08:22:43.200Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 2, "total_pages": 1 }
}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `type` | `IN` = เพิ่มสต็อก, `OUT` = ลดสต็อก |
| `quantity` | จำนวนที่เปลี่ยน (เป็นค่าบวกเสมอ ดูทิศทางจาก `type`) |
| `stock_before` / `stock_after` | สต็อกก่อนและหลังทำรายการ |
| `reason` | เหตุผลสั้นๆ (อาจเป็น `null`) |

**400 VALIDATION_ERROR** · **404 NOT_FOUND** (ไม่พบสินค้า) รูปแบบเหมือน `GET /api/products/:id`

---

## Stock

### PATCH /api/stock/adjust

ปรับสต็อก (+ เพิ่ม, - ลด) และบันทึกลงประวัติรายการทุกครั้ง

**การรับประกัน**
- สต็อกไม่มีทางติดลบ ถ้าลดเกินคงเหลือจะตอบ `409` และไม่เปลี่ยนแปลงข้อมูลใดๆ
- การปรับสต็อกและการบันทึกประวัติเกิดใน transaction เดียวกัน (สำเร็จทั้งคู่หรือไม่ทำเลย)
- คำขอที่ปรับสินค้าเดียวกันพร้อมกันจะถูกจัดคิวด้วย row lock (`SELECT ... FOR UPDATE`) ผลลัพธ์จึงถูกต้องเสมอ

**Request Body**

| ฟิลด์ | ชนิด | บังคับ | เงื่อนไข |
|---|---|---|---|
| `product_id` | integer | ใช่ | id ของสินค้าที่มีอยู่ |
| `change` | integer | ใช่ | จำนวนที่ปรับ เช่น `10` หรือ `-5` ห้ามเป็น `0` และไม่เกิน ±1,000,000 ต่อครั้ง (รับข้อความ `"+10"` / `"-5"` ได้ด้วย) |
| `reason` | string | ไม่ | ไม่เกิน 255 ตัวอักษร |

```json
{ "product_id": 1, "change": -3, "reason": "ขายออก" }
```

**200 OK**

```json
{
  "data": {
    "product": {
      "id": 1,
      "category_id": 1,
      "name": "Keyboard",
      "sku": "KB-001",
      "cost_price": 350.5,
      "stock_quantity": 12,
      "created_at": "2026-10-08T08:22:43.200Z",
      "updated_at": "2026-10-08T08:40:00.000Z"
    },
    "transaction": {
      "id": 2,
      "product_id": 1,
      "type": "OUT",
      "quantity": 3,
      "stock_before": 15,
      "stock_after": 12,
      "reason": "ขายออก",
      "created_at": "2026-10-08T08:40:00.000Z"
    }
  }
}
```

**400 VALIDATION_ERROR**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อมูลการปรับสต็อกไม่ถูกต้อง",
    "details": [{ "field": "change", "message": "change ต้องไม่เป็น 0" }]
  }
}
```

**404 NOT_FOUND**

```json
{
  "error": { "code": "NOT_FOUND", "message": "ไม่พบสินค้า id 999" }
}
```

**409 INSUFFICIENT_STOCK** (สต็อกไม่พอ)

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "สต็อกไม่พอ: คงเหลือ 15 ชิ้น แต่ต้องการลด 100 ชิ้น",
    "details": { "available": 15, "requested": 100 }
  }
}
```

**409 STOCK_LIMIT_EXCEEDED** (สต็อกรวมเกิน 2,147,483,647)

```bash
curl -X PATCH http://localhost:3000/api/stock/adjust \
  -H "Content-Type: application/json" \
  -d '{"product_id":1,"change":-3,"reason":"ขายออก"}'
```

---

## Categories

### GET /api/categories

รายการหมวดหมู่เรียงตามชื่อ พร้อมจำนวนสินค้าในแต่ละหมวด

**200 OK**

```json
{
  "data": [
    { "id": 3, "name": "Furniture", "description": "เฟอร์นิเจอร์", "product_count": 1, "created_at": "2026-10-08T08:00:00.000Z" },
    { "id": 1, "name": "IT", "description": "อุปกรณ์ไอทีและคอมพิวเตอร์", "product_count": 2, "created_at": "2026-10-08T08:00:00.000Z" }
  ]
}
```

### POST /api/categories

| ฟิลด์ | ชนิด | บังคับ | เงื่อนไข |
|---|---|---|---|
| `name` | string | ใช่ | 1 - 100 ตัวอักษร ห้ามซ้ำ |
| `description` | string | ไม่ | ไม่เกิน 255 ตัวอักษร |

```json
{ "name": "Tools", "description": "เครื่องมือช่าง" }
```

**201 Created**

```json
{
  "data": {
    "id": 4,
    "name": "Tools",
    "description": "เครื่องมือช่าง",
    "product_count": 0,
    "created_at": "2026-10-08T08:33:27.839Z"
  }
}
```

**400 VALIDATION_ERROR** · **409 DUPLICATE_CATEGORY**

```json
{
  "error": { "code": "DUPLICATE_CATEGORY", "message": "หมวดหมู่ \"Tools\" มีอยู่แล้ว" }
}
```

---

## Health

### GET /api/health

**200 OK**

```json
{ "status": "ok", "database": "connected" }
```

ถ้าเชื่อมต่อฐานข้อมูลไม่ได้จะตอบ `500 INTERNAL_ERROR`

---

## รหัส Error ทั้งหมด

| HTTP | `code` | เมื่อไหร่ |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ข้อมูล body / query / path ไม่ถูกต้อง (ดู `details`) |
| 400 | `INVALID_JSON` | body ไม่ใช่ JSON ที่ถูกต้อง |
| 400 | `CATEGORY_NOT_FOUND` | `category_id` ที่ส่งมาไม่มีอยู่ |
| 400 | `INVALID_REFERENCE` | ข้อมูลอ้างอิงผิด (foreign key) |
| 404 | `NOT_FOUND` | ไม่พบสินค้า |
| 404 | `ROUTE_NOT_FOUND` | ไม่มี endpoint นี้ |
| 409 | `DUPLICATE_SKU` | SKU ซ้ำ |
| 409 | `DUPLICATE_CATEGORY` | ชื่อหมวดหมู่ซ้ำ |
| 409 | `DUPLICATE` | ข้อมูลซ้ำ (กรณี unique อื่นๆ) |
| 409 | `INSUFFICIENT_STOCK` | ลดสต็อกเกินจำนวนคงเหลือ |
| 409 | `STOCK_LIMIT_EXCEEDED` | สต็อกรวมเกินขีดจำกัดของระบบ |
| 500 | `INTERNAL_ERROR` | ข้อผิดพลาดภายในระบบ (ไม่เปิดเผยรายละเอียดภายใน) |