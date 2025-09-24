/**
 * Expanded database schema types for comprehensive PostgreSQL integration tests
 */

import { createContext } from "@webpods/tinqer";

/**
 * Complete database schema with all tables for thorough ORM testing
 */
export interface ExpandedTestDatabaseSchema {
  // Original tables (enhanced)
  users: {
    id: number;
    name: string;
    email: string;
    age: number | null;
    department_id: number | null;
    salary: number | null;
    hire_date: Date | null;
    is_active: boolean;
    role: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country_id: number | null;
    created_at: Date;
    updated_at: Date;
  };

  departments: {
    id: number;
    company_id: number;
    name: string;
    parent_dept_id: number | null;
    budget: number | null;
    head_count: number;
    created_at: Date;
  };

  products: {
    id: number;
    name: string;
    sku: string | null;
    price: number;
    cost: number | null;
    stock: number;
    category_id: number | null;
    description: string | null;
    weight: number | null;
    dimensions: string | null;
    is_featured: boolean;
    rating: number | null;
    review_count: number;
    manufacturer: string | null;
    created_at: Date;
    updated_at: Date;
  };

  orders: {
    id: number;
    order_number: string;
    user_id: number;
    order_date: Date;
    ship_date: Date | null;
    delivery_date: Date | null;
    total_amount: number;
    tax_amount: number;
    shipping_amount: number;
    discount_amount: number;
    status: string;
    payment_method: string | null;
    shipping_address: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  };

  order_items: {
    id: number;
    order_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    tax_amount: number;
    created_at: Date;
  };

  // New tables for expanded testing
  countries: {
    id: number;
    code: string;
    name: string;
    region: string | null;
    population: bigint | null;
    gdp_usd: number | null;
    created_at: Date;
  };

  companies: {
    id: number;
    name: string;
    country_id: number | null;
    founded_year: number | null;
    is_public: boolean;
    market_cap: number | null;
    employee_count: number | null;
    created_at: Date;
  };

  categories: {
    id: number;
    name: string;
    parent_id: number | null;
    level: number;
    path: string | null;
    is_active: boolean;
    sort_order: number;
    created_at: Date;
  };

  employees: {
    id: number;
    employee_code: string;
    first_name: string;
    last_name: string;
    email: string;
    department_id: number | null;
    manager_id: number | null;
    job_title: string | null;
    salary: number | null;
    commission_pct: number | null;
    hire_date: Date;
    is_active: boolean;
    created_at: Date;
  };

  projects: {
    id: number;
    code: string;
    name: string;
    description: string | null;
    department_id: number | null;
    budget: number | null;
    start_date: Date | null;
    end_date: Date | null;
    status: string;
    priority: number;
    completion_percentage: number;
    created_at: Date;
    updated_at: Date;
  };

  project_assignments: {
    id: number;
    project_id: number;
    employee_id: number;
    role: string | null;
    hours_allocated: number | null;
    start_date: Date | null;
    end_date: Date | null;
    is_active: boolean;
    created_at: Date;
  };

  audit_logs: {
    id: number;
    table_name: string;
    record_id: number;
    action: string;
    old_values: any; // JSONB in PostgreSQL
    new_values: any; // JSONB in PostgreSQL
    user_id: number | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
  };

  inventory: {
    id: number;
    product_id: number;
    warehouse_location: string | null;
    quantity_on_hand: number;
    quantity_reserved: number;
    quantity_available: number; // Generated column
    reorder_point: number | null;
    reorder_quantity: number | null;
    last_restock_date: Date | null;
    created_at: Date;
    updated_at: Date;
  };

  inventory_transactions: {
    id: number;
    inventory_id: number;
    transaction_type: string;
    quantity: number;
    reference_type: string | null;
    reference_id: number | null;
    notes: string | null;
    created_at: Date;
  };

  reviews: {
    id: number;
    product_id: number;
    user_id: number;
    rating: number;
    title: string | null;
    comment: string | null;
    is_verified_purchase: boolean;
    helpful_count: number;
    created_at: Date;
    updated_at: Date;
  };

  tags: {
    id: number;
    name: string;
    slug: string;
    usage_count: number;
    created_at: Date;
  };

  product_tags: {
    product_id: number;
    tag_id: number;
    created_at: Date;
  };
}

// Type aliases for convenience
export type User = ExpandedTestDatabaseSchema["users"];
export type Department = ExpandedTestDatabaseSchema["departments"];
export type Product = ExpandedTestDatabaseSchema["products"];
export type Order = ExpandedTestDatabaseSchema["orders"];
export type OrderItem = ExpandedTestDatabaseSchema["order_items"];
export type Country = ExpandedTestDatabaseSchema["countries"];
export type Company = ExpandedTestDatabaseSchema["companies"];
export type Category = ExpandedTestDatabaseSchema["categories"];
export type Employee = ExpandedTestDatabaseSchema["employees"];
export type Project = ExpandedTestDatabaseSchema["projects"];
export type ProjectAssignment = ExpandedTestDatabaseSchema["project_assignments"];
export type AuditLog = ExpandedTestDatabaseSchema["audit_logs"];
export type Inventory = ExpandedTestDatabaseSchema["inventory"];
export type InventoryTransaction = ExpandedTestDatabaseSchema["inventory_transactions"];
export type Review = ExpandedTestDatabaseSchema["reviews"];
export type Tag = ExpandedTestDatabaseSchema["tags"];
export type ProductTag = ExpandedTestDatabaseSchema["product_tags"];

/**
 * Typed database context for use with from() function
 */
export const expandedDbContext = createContext<ExpandedTestDatabaseSchema>();
