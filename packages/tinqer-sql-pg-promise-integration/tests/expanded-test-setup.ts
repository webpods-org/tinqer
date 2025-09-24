/**
 * Expanded test setup with comprehensive schema for thorough ORM testing
 */

import type { IDatabase } from "pg-promise";

export async function setupExpandedTestDatabase(db: IDatabase<any>) {
  // Drop all existing tables in correct order (respecting foreign keys)
  await db.none(`
    DROP TABLE IF EXISTS product_tags CASCADE;
    DROP TABLE IF EXISTS tags CASCADE;
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS inventory_transactions CASCADE;
    DROP TABLE IF EXISTS inventory CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS project_assignments CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP TABLE IF EXISTS employees CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS order_items CASCADE;
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS products CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS companies CASCADE;
    DROP TABLE IF EXISTS countries CASCADE;
  `);

  // Create countries table (for testing string operations and lookups)
  await db.none(`
    CREATE TABLE countries (
      id SERIAL PRIMARY KEY,
      code VARCHAR(2) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      region VARCHAR(50),
      population BIGINT,
      gdp_usd DECIMAL(15, 2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create companies table (parent entity)
  await db.none(`
    CREATE TABLE companies (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      country_id INTEGER,
      founded_year INTEGER,
      is_public BOOLEAN DEFAULT false,
      market_cap DECIMAL(15, 2),
      employee_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (country_id) REFERENCES countries(id)
    );
  `);

  // Create departments table
  await db.none(`
    CREATE TABLE departments (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      parent_dept_id INTEGER,
      budget DECIMAL(12, 2),
      head_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (parent_dept_id) REFERENCES departments(id)
    );
  `);

  // Create users table (expanded)
  await db.none(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      age INTEGER,
      department_id INTEGER,
      salary DECIMAL(10, 2),
      hire_date DATE,
      is_active BOOLEAN DEFAULT true,
      role VARCHAR(50),
      phone VARCHAR(20),
      address TEXT,
      city VARCHAR(100),
      country_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (country_id) REFERENCES countries(id)
    );
  `);

  // Create categories table (self-referential for hierarchies)
  await db.none(`
    CREATE TABLE categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      parent_id INTEGER,
      level INTEGER DEFAULT 0,
      path TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
    );
  `);

  // Create products table (expanded)
  await db.none(`
    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      sku VARCHAR(50) UNIQUE,
      price DECIMAL(10, 2) NOT NULL,
      cost DECIMAL(10, 2),
      stock INTEGER NOT NULL DEFAULT 0,
      category_id INTEGER,
      description TEXT,
      weight DECIMAL(8, 3),
      dimensions VARCHAR(50),
      is_featured BOOLEAN DEFAULT false,
      rating DECIMAL(3, 2),
      review_count INTEGER DEFAULT 0,
      manufacturer VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  // Create orders table
  await db.none(`
    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(20) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      order_date DATE NOT NULL DEFAULT CURRENT_DATE,
      ship_date DATE,
      delivery_date DATE,
      total_amount DECIMAL(10, 2) NOT NULL,
      tax_amount DECIMAL(10, 2) DEFAULT 0,
      shipping_amount DECIMAL(10, 2) DEFAULT 0,
      discount_amount DECIMAL(10, 2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      payment_method VARCHAR(50),
      shipping_address TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Create order_items table
  await db.none(`
    CREATE TABLE order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      discount_percent DECIMAL(5, 2) DEFAULT 0,
      tax_amount DECIMAL(10, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Create employees table (self-referential for manager relationships)
  await db.none(`
    CREATE TABLE employees (
      id SERIAL PRIMARY KEY,
      employee_code VARCHAR(20) UNIQUE NOT NULL,
      first_name VARCHAR(50) NOT NULL,
      last_name VARCHAR(50) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      department_id INTEGER,
      manager_id INTEGER,
      job_title VARCHAR(100),
      salary DECIMAL(10, 2),
      commission_pct DECIMAL(4, 2),
      hire_date DATE NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (manager_id) REFERENCES employees(id)
    );
  `);

  // Create projects table
  await db.none(`
    CREATE TABLE projects (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      department_id INTEGER,
      budget DECIMAL(12, 2),
      start_date DATE,
      end_date DATE,
      status VARCHAR(20) DEFAULT 'planning',
      priority INTEGER DEFAULT 3,
      completion_percentage DECIMAL(5, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );
  `);

  // Create project_assignments junction table (many-to-many)
  await db.none(`
    CREATE TABLE project_assignments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      role VARCHAR(50),
      hours_allocated DECIMAL(6, 2),
      start_date DATE,
      end_date DATE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(project_id, employee_id)
    );
  `);

  // Create audit_logs table (for temporal queries)
  await db.none(`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(50) NOT NULL,
      record_id INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      old_values JSONB,
      new_values JSONB,
      user_id INTEGER,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Create inventory table
  await db.none(`
    CREATE TABLE inventory (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      warehouse_location VARCHAR(50),
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER DEFAULT 0,
      quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
      reorder_point INTEGER,
      reorder_quantity INTEGER,
      last_restock_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Create inventory_transactions table
  await db.none(`
    CREATE TABLE inventory_transactions (
      id SERIAL PRIMARY KEY,
      inventory_id INTEGER NOT NULL,
      transaction_type VARCHAR(20) NOT NULL,
      quantity INTEGER NOT NULL,
      reference_type VARCHAR(50),
      reference_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id)
    );
  `);

  // Create reviews table
  await db.none(`
    CREATE TABLE reviews (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      title VARCHAR(200),
      comment TEXT,
      is_verified_purchase BOOLEAN DEFAULT false,
      helpful_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(product_id, user_id)
    );
  `);

  // Create tags table
  await db.none(`
    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      slug VARCHAR(50) UNIQUE NOT NULL,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create product_tags junction table (many-to-many)
  await db.none(`
    CREATE TABLE product_tags (
      product_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_id, tag_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for better query performance
  await db.none(`
    CREATE INDEX idx_users_department ON users(department_id);
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_products_category ON products(category_id);
    CREATE INDEX idx_products_sku ON products(sku);
    CREATE INDEX idx_orders_user ON orders(user_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_order_items_order ON order_items(order_id);
    CREATE INDEX idx_order_items_product ON order_items(product_id);
    CREATE INDEX idx_employees_manager ON employees(manager_id);
    CREATE INDEX idx_categories_parent ON categories(parent_id);
    CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
    CREATE INDEX idx_reviews_product ON reviews(product_id);
    CREATE INDEX idx_reviews_user ON reviews(user_id);
  `);
}

export async function seedExpandedTestData(db: IDatabase<any>) {
  // Seed countries (reduced GDP values to avoid numeric overflow)
  await db.none(`
    INSERT INTO countries (code, name, region, population, gdp_usd) VALUES
    ('US', 'United States', 'North America', 331000000, 21427700.00),
    ('UK', 'United Kingdom', 'Europe', 67886000, 2827000.00),
    ('DE', 'Germany', 'Europe', 83783000, 3846000.00),
    ('JP', 'Japan', 'Asia', 126476000, 5064000.00),
    ('CN', 'China', 'Asia', 1439323000, 14342000.00),
    ('IN', 'India', 'Asia', 1380004000, 2875000.00),
    ('BR', 'Brazil', 'South America', 212559000, 1839000.00),
    ('AU', 'Australia', 'Oceania', 25499000, 1392000.00),
    ('CA', 'Canada', 'North America', 37742000, 1736000.00),
    ('FR', 'France', 'Europe', 65273000, 2715000.00);
  `);

  // Seed companies (reduced market cap values to avoid numeric overflow)
  await db.none(`
    INSERT INTO companies (name, country_id, founded_year, is_public, market_cap, employee_count) VALUES
    ('TechCorp Global', 1, 1998, true, 1500000.00, 150000),
    ('RetailMax International', 1, 1962, true, 400000.00, 2300000),
    ('FinanceHub Ltd', 2, 1836, true, 250000.00, 85000),
    ('Manufacturing Plus', 3, 1953, false, NULL, 45000),
    ('StartupCo', 1, 2019, false, NULL, 250);
  `);

  // Seed departments (expanded)
  await db.none(`
    INSERT INTO departments (company_id, name, budget, head_count) VALUES
    (1, 'Engineering', 50000000, 500),
    (1, 'Sales', 30000000, 200),
    (1, 'Marketing', 20000000, 150),
    (1, 'HR', 15000000, 50),
    (1, 'Finance', 25000000, 100),
    (1, 'Operations', 35000000, 300),
    (2, 'Store Operations', 80000000, 1500000),
    (2, 'Supply Chain', 60000000, 300000),
    (2, 'Corporate', 40000000, 50000),
    (3, 'Investment Banking', 100000000, 30000),
    (3, 'Retail Banking', 80000000, 40000),
    (3, 'Risk Management', 30000000, 10000),
    (4, 'Production', 40000000, 35000),
    (4, 'Quality Control', 10000000, 5000),
    (5, 'Product', 5000000, 100),
    (5, 'Engineering', 8000000, 120);
  `);

  // Seed categories (hierarchical)
  await db.none(`
    INSERT INTO categories (id, name, parent_id, level, path, sort_order) VALUES
    (1, 'Electronics', NULL, 0, '1', 1),
    (2, 'Computers', 1, 1, '1.2', 1),
    (3, 'Laptops', 2, 2, '1.2.3', 1),
    (4, 'Desktops', 2, 2, '1.2.4', 2),
    (5, 'Accessories', 1, 1, '1.5', 2),
    (6, 'Furniture', NULL, 0, '6', 2),
    (7, 'Office Furniture', 6, 1, '6.7', 1),
    (8, 'Home Furniture', 6, 1, '6.8', 2),
    (9, 'Stationery', NULL, 0, '9', 3),
    (10, 'Writing', 9, 1, '9.10', 1),
    (11, 'Paper', 9, 1, '9.11', 2),
    (12, 'Audio', 1, 1, '1.12', 3),
    (13, 'Headphones', 12, 2, '1.12.13', 1),
    (14, 'Speakers', 12, 2, '1.12.14', 2),
    (15, 'Gaming', 1, 1, '1.15', 4);
  `);

  // Seed users (expanded with more variety)
  await db.none(`
    INSERT INTO users (name, email, age, department_id, salary, hire_date, is_active, role, phone, city, country_id) VALUES
    ('John Doe', 'john@example.com', 30, 1, 95000, '2020-01-15', true, 'Senior Engineer', '+1-555-0101', 'San Francisco', 1),
    ('Jane Smith', 'jane@example.com', 25, 2, 75000, '2021-06-01', true, 'Sales Manager', '+1-555-0102', 'New York', 1),
    ('Bob Johnson', 'bob@example.com', 35, 1, 105000, '2018-03-20', true, 'Lead Engineer', '+1-555-0103', 'Seattle', 1),
    ('Alice Brown', 'alice@example.com', 28, 3, 65000, '2020-09-10', true, 'Marketing Specialist', '+1-555-0104', 'Austin', 1),
    ('Charlie Wilson', 'charlie@example.com', 45, 4, 120000, '2015-02-28', false, 'HR Director', '+1-555-0105', 'Boston', 1),
    ('Diana Prince', 'diana@example.com', 33, 1, 98000, '2019-07-15', true, 'Senior Engineer', '+1-555-0106', 'San Francisco', 1),
    ('Eva Green', 'eva@example.com', 27, 2, 68000, '2021-01-10', true, 'Sales Rep', '+1-555-0107', 'Chicago', 1),
    ('Frank Castle', 'frank@example.com', 40, 1, 110000, '2017-05-01', false, 'Staff Engineer', '+1-555-0108', 'Portland', 1),
    ('Grace Hopper', 'grace@example.com', 38, 5, 95000, '2018-08-20', true, 'Financial Analyst', '+1-555-0109', 'Denver', 1),
    ('Henry Ford', 'henry@example.com', 55, 6, 150000, '2010-01-01', true, 'Operations VP', '+1-555-0110', 'Detroit', 1),
    ('Iris West', 'iris@example.com', 29, 3, 62000, '2020-11-15', true, 'Content Manager', '+1-555-0111', 'Los Angeles', 1),
    ('Jack Ryan', 'jack@example.com', 42, 5, 89000, '2016-04-10', true, 'Senior Accountant', '+1-555-0112', 'Philadelphia', 1),
    ('Kate Bishop', 'kate@example.com', 26, 1, 72000, '2021-08-01', true, 'Junior Engineer', '+1-555-0113', 'San Diego', 1),
    ('Luke Cage', 'luke@example.com', 36, 6, 85000, '2017-09-15', true, 'Operations Manager', '+1-555-0114', 'Miami', 1),
    ('Mary Jane', 'mary@example.com', 31, 2, 78000, '2019-03-05', true, 'Sales Lead', '+1-555-0115', 'Phoenix', 1),
    ('Nathan Drake', 'nathan@example.com', 34, 1, 92000, '2018-06-20', true, 'Senior Engineer', '+1-555-0116', 'Las Vegas', 1),
    ('Olivia Pope', 'olivia@example.com', 37, 4, 105000, '2016-01-25', true, 'HR Manager', '+1-555-0117', 'Washington DC', 1),
    ('Peter Parker', 'peter@example.com', 23, 1, 65000, '2022-07-01', true, 'Junior Engineer', '+1-555-0118', 'Queens', 1),
    ('Quinn Fabray', 'quinn@example.com', 32, 3, 70000, '2019-05-15', true, 'Brand Manager', '+1-555-0119', 'Nashville', 1),
    ('Robert Banner', 'robert@example.com', 41, 5, 98000, '2015-11-30', true, 'Finance Manager', '+1-555-0120', 'Atlanta', 1),
    ('Sarah Connor', 'sarah@example.com', 39, 6, 88000, '2017-02-14', true, 'Logistics Manager', '+44-20-0121', 'London', 2),
    ('Tony Stark', 'tony@example.com', 48, 1, 180000, '2012-05-01', true, 'Engineering Director', '+1-555-0122', 'Malibu', 1),
    ('Uma Thurman', 'uma@example.com', 44, 3, 95000, '2014-08-10', true, 'Marketing Director', '+49-30-0123', 'Berlin', 3),
    ('Victor Stone', 'victor@example.com', 28, 1, 78000, '2020-04-01', true, 'DevOps Engineer', '+1-555-0124', 'Detroit', 1),
    ('Wade Wilson', 'wade@example.com', 35, 2, 82000, '2018-12-15', true, 'Sales Manager', '+1-416-0125', 'Toronto', 9),
    ('Xavier Charles', 'xavier@example.com', 60, 4, 200000, '2005-01-01', true, 'CHRO', '+1-555-0126', 'Westchester', 1),
    ('Yara Flor', 'yara@example.com', 24, 1, 70000, '2022-01-10', true, 'Software Engineer', '+55-11-0127', 'São Paulo', 7),
    ('Zoe Washburn', 'zoe@example.com', 36, 6, 92000, '2017-07-20', true, 'Supply Chain Manager', '+61-2-0128', 'Sydney', 8),
    ('Amy Pond', 'amy@example.com', NULL, 3, 68000, '2019-10-01', true, 'Marketing Analyst', '+44-131-0129', 'Edinburgh', 2),
    ('Bruce Wayne', 'bruce@example.com', 42, NULL, 250000, '2008-01-01', false, 'CEO', '+1-555-0130', 'Gotham', 1);
  `);

  // Seed products (expanded)
  await db.none(`
    INSERT INTO products (name, sku, price, cost, stock, category_id, description, weight, is_featured, rating, review_count, manufacturer) VALUES
    ('MacBook Pro 16"', 'MBP16-2023', 2499.99, 1800, 25, 3, 'High-performance laptop with M3 chip', 2.1, true, 4.7, 342, 'Apple'),
    ('Dell XPS 15', 'DELLXPS15-2023', 1899.99, 1400, 30, 3, 'Premium Windows ultrabook', 1.8, true, 4.5, 256, 'Dell'),
    ('Gaming Desktop RTX4090', 'GAME-PC-4090', 3999.99, 3000, 10, 4, 'Ultimate gaming machine', 15.0, true, 4.8, 89, 'Custom'),
    ('Wireless Mouse Pro', 'MOUSE-WL-PRO', 79.99, 35, 150, 5, 'Ergonomic wireless mouse with 6 buttons', 0.12, false, 4.3, 523, 'Logitech'),
    ('Mechanical Keyboard RGB', 'KB-MECH-RGB', 149.99, 80, 75, 5, 'Cherry MX switches with RGB lighting', 1.1, false, 4.6, 412, 'Corsair'),
    ('4K Monitor 32"', 'MON-4K-32', 699.99, 450, 40, 5, '32-inch 4K HDR display', 8.5, true, 4.4, 178, 'LG'),
    ('Standing Desk Electric', 'DESK-STAND-E', 799.99, 500, 20, 7, 'Electric height adjustable desk', 45.0, false, 4.5, 234, 'Uplift'),
    ('Ergonomic Office Chair', 'CHAIR-ERGO-PRO', 599.99, 350, 35, 7, 'Premium ergonomic chair with lumbar support', 18.0, false, 4.2, 567, 'Herman Miller'),
    ('A4 Notebook Pack', 'NOTE-A4-10', 24.99, 10, 200, 11, 'Pack of 10 A4 notebooks', 2.0, false, 4.1, 89, 'Moleskine'),
    ('Premium Pen Set', 'PEN-PREM-SET', 49.99, 20, 100, 10, 'Set of 5 premium fountain pens', 0.25, false, 4.3, 156, 'Parker'),
    ('Noise-Cancel Headphones', 'HP-NC-PRO', 349.99, 200, 60, 13, 'Premium noise-canceling headphones', 0.28, true, 4.6, 892, 'Sony'),
    ('Bluetooth Speaker', 'SPEAK-BT-360', 199.99, 120, 80, 14, '360-degree Bluetooth speaker', 1.5, false, 4.4, 445, 'JBL'),
    ('Gaming Headset RGB', 'HS-GAME-RGB', 129.99, 70, 90, 13, 'Gaming headset with 7.1 surround', 0.35, false, 4.5, 678, 'Razer'),
    ('Webcam 4K Pro', 'CAM-4K-PRO', 179.99, 100, 55, 5, '4K webcam with AI tracking', 0.18, false, 4.3, 234, 'Logitech'),
    ('USB-C Hub 10-in-1', 'HUB-USBC-10', 89.99, 40, 120, 5, '10-port USB-C hub with charging', 0.15, false, 4.2, 567, 'Anker'),
    ('Gaming Chair RGB', 'CHAIR-GAME-RGB', 399.99, 250, 45, 15, 'Gaming chair with RGB lighting', 22.0, false, 4.4, 345, 'SecretLab'),
    ('Laptop Stand Aluminum', 'STAND-LAP-AL', 59.99, 25, 180, 5, 'Adjustable aluminum laptop stand', 0.8, false, 4.3, 432, 'Rain Design'),
    ('Smart Home Hub', 'HUB-SMART-V3', 149.99, 80, 70, 1, 'Central smart home controller', 0.3, false, 4.1, 298, 'Amazon'),
    ('Wireless Charger 3-in-1', 'CHARGE-WL-3', 79.99, 35, 95, 5, 'Charges phone, watch, and earbuds', 0.25, false, 4.2, 412, 'Belkin'),
    ('External SSD 2TB', 'SSD-EXT-2TB', 299.99, 180, 65, 5, 'Portable 2TB SSD with USB-C', 0.08, false, 4.5, 623, 'Samsung'),
    ('Coffee Maker Smart', 'COFFEE-SMART', 249.99, 150, 40, 1, 'Smart coffee maker with app control', 3.5, false, 4.3, 187, 'Breville'),
    ('Air Purifier HEPA', 'AIR-PURE-H13', 399.99, 250, 30, 1, 'HEPA H13 air purifier for large rooms', 6.0, false, 4.4, 456, 'Dyson'),
    ('Robot Vacuum AI', 'VAC-ROBOT-AI', 799.99, 500, 25, 1, 'AI-powered robot vacuum with mapping', 3.8, true, 4.5, 782, 'iRobot'),
    ('Smart Doorbell HD', 'BELL-SMART-HD', 199.99, 120, 85, 1, 'HD video doorbell with motion detection', 0.5, false, 4.2, 523, 'Ring'),
    ('Mesh WiFi System', 'WIFI-MESH-3P', 349.99, 200, 50, 1, '3-pack mesh WiFi system', 1.2, false, 4.3, 678, 'Eero'),
    ('Ultrawide Monitor 49"', 'MON-UW-49', 1499.99, 1000, 15, 5, '49-inch ultrawide curved monitor', 15.0, true, 4.6, 234, 'Samsung'),
    ('Graphics Tablet Pro', 'TAB-GRAPH-PRO', 699.99, 400, 35, 5, 'Professional graphics tablet with pen', 1.5, false, 4.5, 156, 'Wacom'),
    ('Studio Microphone', 'MIC-STUDIO-PRO', 299.99, 180, 45, 12, 'Professional studio condenser mic', 0.8, false, 4.4, 389, 'Blue'),
    ('Cable Management Kit', 'CABLE-MGT-KIT', 29.99, 12, 250, 5, 'Complete cable management solution', 0.5, false, 4.0, 234, 'Generic'),
    ('Desk Pad XXL', 'PAD-DESK-XXL', 39.99, 15, 200, 5, 'XXL desk pad 90x40cm', 0.6, false, 4.2, 567, 'Generic');
  `);

  // Seed employees with hierarchical structure
  await db.none(`
    INSERT INTO employees (employee_code, first_name, last_name, email, department_id, manager_id, job_title, salary, commission_pct, hire_date, is_active) VALUES
    ('EMP001', 'William', 'Gates', 'wgates@company.com', 1, NULL, 'CTO', 350000, NULL, '2010-01-01', true),
    ('EMP002', 'Steve', 'Jobs', 'sjobs@company.com', 1, 1, 'VP Engineering', 250000, NULL, '2011-03-15', true),
    ('EMP003', 'Mark', 'Zuckerberg', 'mzuck@company.com', 1, 2, 'Engineering Manager', 180000, NULL, '2015-06-01', true),
    ('EMP004', 'Elon', 'Musk', 'emusk@company.com', 1, 2, 'Engineering Manager', 180000, NULL, '2016-01-10', true),
    ('EMP005', 'Jeff', 'Bezos', 'jbezos@company.com', 2, NULL, 'VP Sales', 220000, 15.00, '2012-04-01', true),
    ('EMP006', 'Tim', 'Cook', 'tcook@company.com', 2, 5, 'Sales Director', 150000, 12.50, '2014-08-15', true),
    ('EMP007', 'Satya', 'Nadella', 'snadella@company.com', 1, 3, 'Senior Engineer', 120000, NULL, '2017-02-20', true),
    ('EMP008', 'Sundar', 'Pichai', 'spichai@company.com', 1, 3, 'Senior Engineer', 120000, NULL, '2017-05-10', true),
    ('EMP009', 'Jensen', 'Huang', 'jhuang@company.com', 1, 4, 'Senior Engineer', 120000, NULL, '2018-01-15', true),
    ('EMP010', 'Lisa', 'Su', 'lsu@company.com', 1, 4, 'Senior Engineer', 120000, NULL, '2018-03-20', true),
    ('EMP011', 'Reed', 'Hastings', 'rhastings@company.com', 3, NULL, 'VP Marketing', 200000, NULL, '2013-07-01', true),
    ('EMP012', 'Susan', 'Wojcicki', 'swojcicki@company.com', 3, 11, 'Marketing Director', 140000, NULL, '2016-09-15', true),
    ('EMP013', 'Jack', 'Dorsey', 'jdorsey@company.com', 5, NULL, 'CFO', 280000, NULL, '2011-05-01', true),
    ('EMP014', 'Daniel', 'Ek', 'dek@company.com', 5, 13, 'Finance Director', 160000, NULL, '2015-11-20', true),
    ('EMP015', 'Brian', 'Chesky', 'bchesky@company.com', 6, NULL, 'COO', 260000, NULL, '2012-02-15', true),
    ('EMP016', 'Travis', 'Kalanick', 'tkalanick@company.com', 6, 15, 'Operations Director', 145000, NULL, '2016-06-10', false),
    ('EMP017', 'Drew', 'Houston', 'dhouston@company.com', 1, 7, 'Engineer', 95000, NULL, '2019-04-01', true),
    ('EMP018', 'Kevin', 'Systrom', 'ksystrom@company.com', 1, 8, 'Engineer', 95000, NULL, '2019-07-15', true),
    ('EMP019', 'Evan', 'Spiegel', 'espiegel@company.com', 2, 6, 'Sales Manager', 110000, 10.00, '2018-10-01', true),
    ('EMP020', 'Bobby', 'Murphy', 'bmurphy@company.com', 2, 6, 'Sales Manager', 110000, 10.00, '2018-12-15', true),
    ('EMP021', 'Jan', 'Koum', 'jkoum@company.com', 1, 9, 'Engineer', 92000, NULL, '2020-01-10', true),
    ('EMP022', 'Brian', 'Acton', 'bacton@company.com', 1, 10, 'Engineer', 92000, NULL, '2020-03-20', true),
    ('EMP023', 'Palmer', 'Luckey', 'pluckey@company.com', 1, 17, 'Junior Engineer', 75000, NULL, '2021-05-01', true),
    ('EMP024', 'Brendan', 'Iribe', 'biribe@company.com', 1, 18, 'Junior Engineer', 75000, NULL, '2021-08-15', true),
    ('EMP025', 'Patrick', 'Collison', 'pcollison@company.com', 5, 14, 'Financial Analyst', 85000, NULL, '2019-02-10', true);
  `);

  // Seed projects
  await db.none(`
    INSERT INTO projects (code, name, description, department_id, budget, start_date, end_date, status, priority, completion_percentage) VALUES
    ('PROJ-001', 'Cloud Migration', 'Migrate infrastructure to cloud', 1, 2000000, '2024-01-01', '2024-12-31', 'in_progress', 1, 45.50),
    ('PROJ-002', 'Mobile App v2.0', 'Complete rewrite of mobile application', 1, 1500000, '2024-03-01', '2024-09-30', 'in_progress', 1, 30.00),
    ('PROJ-003', 'CRM Implementation', 'New CRM system rollout', 2, 800000, '2024-02-01', '2024-08-31', 'in_progress', 2, 60.00),
    ('PROJ-004', 'Brand Refresh', 'Complete brand identity update', 3, 500000, '2024-01-15', '2024-06-30', 'in_progress', 3, 75.00),
    ('PROJ-005', 'Data Lake', 'Build enterprise data lake', 1, 3000000, '2023-06-01', '2024-06-30', 'completed', 1, 100.00),
    ('PROJ-006', 'Security Audit', 'Annual security audit and fixes', 1, 400000, '2024-04-01', '2024-05-31', 'planning', 1, 0.00),
    ('PROJ-007', 'Sales Training', 'New sales methodology training', 2, 200000, '2024-03-15', '2024-04-30', 'in_progress', 4, 40.00),
    ('PROJ-008', 'Cost Optimization', 'Reduce operational costs by 20%', 6, 100000, '2024-01-01', '2024-06-30', 'in_progress', 2, 55.00),
    ('PROJ-009', 'AI Integration', 'Integrate AI into products', 1, 5000000, '2024-06-01', '2025-12-31', 'planning', 1, 0.00),
    ('PROJ-010', 'Global Expansion', 'Expand to 5 new markets', 2, 10000000, '2024-01-01', '2025-06-30', 'in_progress', 1, 15.00);
  `);

  // Seed project assignments
  await db.none(`
    INSERT INTO project_assignments (project_id, employee_id, role, hours_allocated, start_date, end_date, is_active) VALUES
    (1, 3, 'Project Lead', 40, '2024-01-01', '2024-12-31', true),
    (1, 7, 'Senior Developer', 32, '2024-01-01', '2024-12-31', true),
    (1, 8, 'Senior Developer', 32, '2024-01-15', '2024-12-31', true),
    (1, 17, 'Developer', 40, '2024-02-01', '2024-12-31', true),
    (2, 4, 'Project Lead', 40, '2024-03-01', '2024-09-30', true),
    (2, 9, 'Senior Developer', 40, '2024-03-01', '2024-09-30', true),
    (2, 10, 'Senior Developer', 40, '2024-03-01', '2024-09-30', true),
    (2, 21, 'Developer', 32, '2024-03-15', '2024-09-30', true),
    (2, 22, 'Developer', 32, '2024-03-15', '2024-09-30', true),
    (3, 6, 'Project Lead', 20, '2024-02-01', '2024-08-31', true),
    (3, 19, 'Implementation Specialist', 40, '2024-02-01', '2024-08-31', true),
    (3, 20, 'Implementation Specialist', 40, '2024-02-01', '2024-08-31', true),
    (4, 12, 'Project Lead', 30, '2024-01-15', '2024-06-30', true),
    (5, 3, 'Technical Lead', 40, '2023-06-01', '2024-06-30', false),
    (5, 7, 'Data Engineer', 40, '2023-06-01', '2024-06-30', false),
    (5, 8, 'Data Engineer', 40, '2023-06-01', '2024-06-30', false),
    (6, 9, 'Security Lead', 20, '2024-04-01', '2024-05-31', false),
    (7, 19, 'Trainer', 20, '2024-03-15', '2024-04-30', true),
    (8, 15, 'Project Sponsor', 5, '2024-01-01', '2024-06-30', true),
    (9, 2, 'Executive Sponsor', 10, '2024-06-01', '2025-12-31', false),
    (9, 3, 'Technical Architect', 30, '2024-06-01', '2025-12-31', false),
    (10, 5, 'Executive Sponsor', 10, '2024-01-01', '2025-06-30', true),
    (10, 6, 'Program Manager', 40, '2024-01-01', '2025-06-30', true);
  `);

  // Seed orders (expanded)
  await db.none(`
    INSERT INTO orders (order_number, user_id, order_date, ship_date, delivery_date, total_amount, tax_amount, shipping_amount, discount_amount, status, payment_method, shipping_address) VALUES
    ('ORD-2024-0001', 1, '2024-01-15', '2024-01-16', '2024-01-18', 2599.98, 207.99, 0, 100, 'delivered', 'credit_card', '123 Main St, San Francisco, CA 94105'),
    ('ORD-2024-0002', 2, '2024-01-16', '2024-01-17', '2024-01-19', 229.97, 18.40, 10, 0, 'delivered', 'paypal', '456 Oak Ave, New York, NY 10001'),
    ('ORD-2024-0003', 3, '2024-01-17', '2024-01-18', NULL, 4299.98, 344.00, 0, 200, 'shipped', 'credit_card', '789 Pine Rd, Seattle, WA 98101'),
    ('ORD-2024-0004', 1, '2024-01-18', NULL, NULL, 149.99, 12.00, 15, 0, 'processing', 'debit_card', '123 Main St, San Francisco, CA 94105'),
    ('ORD-2024-0005', 4, '2024-01-19', '2024-01-20', '2024-01-22', 49.98, 4.00, 5, 0, 'delivered', 'credit_card', '321 Elm St, Austin, TX 78701'),
    ('ORD-2024-0006', 5, '2024-01-20', NULL, NULL, 3999.99, 320.00, 0, 0, 'cancelled', 'credit_card', '654 Maple Dr, Boston, MA 02101'),
    ('ORD-2024-0007', 6, '2024-01-21', '2024-01-22', '2024-01-24', 89.99, 7.20, 10, 0, 'delivered', 'paypal', '987 Cedar Ln, San Francisco, CA 94105'),
    ('ORD-2024-0008', 7, '2024-01-22', '2024-01-23', NULL, 1049.97, 84.00, 0, 50, 'shipped', 'credit_card', '147 Birch Blvd, Chicago, IL 60601'),
    ('ORD-2024-0009', 8, '2024-01-23', NULL, NULL, 399.99, 32.00, 0, 0, 'pending', 'credit_card', '258 Spruce Way, Portland, OR 97201'),
    ('ORD-2024-0010', 9, '2024-01-24', '2024-01-25', '2024-01-27', 629.97, 50.40, 0, 30, 'delivered', 'debit_card', '369 Willow Ct, Denver, CO 80201'),
    ('ORD-2024-0011', 10, '2024-01-25', '2024-01-26', NULL, 799.99, 64.00, 0, 0, 'shipped', 'credit_card', '741 Ash Ave, Detroit, MI 48201'),
    ('ORD-2024-0012', 11, '2024-01-26', NULL, NULL, 249.99, 20.00, 15, 0, 'processing', 'paypal', '852 Fir St, Los Angeles, CA 90001'),
    ('ORD-2024-0013', 12, '2024-01-27', '2024-01-28', '2024-01-30', 179.98, 14.40, 10, 10, 'delivered', 'credit_card', '963 Cypress Rd, Philadelphia, PA 19101'),
    ('ORD-2024-0014', 13, '2024-01-28', NULL, NULL, 1699.98, 136.00, 0, 100, 'pending', 'credit_card', '159 Redwood Ln, San Diego, CA 92101'),
    ('ORD-2024-0015', 14, '2024-01-29', '2024-01-30', NULL, 59.99, 4.80, 10, 0, 'shipped', 'debit_card', '357 Sequoia Dr, Miami, FL 33101');
  `);

  // Seed order items
  await db.none(`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_percent, tax_amount) VALUES
    (1, 1, 1, 2499.99, 4.00, 199.99),
    (1, 4, 1, 79.99, 0, 6.40),
    (1, 17, 1, 59.99, 0, 4.80),
    (2, 4, 2, 79.99, 0, 12.80),
    (2, 5, 1, 149.99, 0, 12.00),
    (3, 3, 1, 3999.99, 5.00, 304.00),
    (3, 16, 1, 399.99, 0, 32.00),
    (3, 11, 1, 349.99, 0, 28.00),
    (4, 5, 1, 149.99, 0, 12.00),
    (5, 10, 1, 49.99, 0, 4.00),
    (6, 3, 1, 3999.99, 0, 320.00),
    (7, 15, 1, 89.99, 0, 7.20),
    (8, 6, 1, 699.99, 0, 56.00),
    (8, 11, 1, 349.99, 0, 28.00),
    (8, 19, 1, 79.99, 0, 6.40),
    (9, 16, 1, 399.99, 0, 32.00),
    (10, 7, 1, 799.99, 0, 64.00),
    (11, 8, 1, 599.99, 0, 48.00),
    (11, 12, 1, 199.99, 0, 16.00),
    (12, 21, 1, 249.99, 0, 20.00),
    (13, 4, 1, 79.99, 0, 6.40),
    (13, 14, 1, 179.99, 0, 14.40),
    (14, 26, 1, 1499.99, 0, 120.00),
    (14, 27, 1, 699.99, 0, 56.00),
    (15, 17, 1, 59.99, 0, 4.80);
  `);

  // Seed inventory
  await db.none(`
    INSERT INTO inventory (product_id, warehouse_location, quantity_on_hand, quantity_reserved, reorder_point, reorder_quantity, last_restock_date) VALUES
    (1, 'WAREHOUSE-A-101', 25, 5, 10, 20, '2024-01-10'),
    (2, 'WAREHOUSE-A-102', 30, 3, 15, 25, '2024-01-08'),
    (3, 'WAREHOUSE-B-201', 10, 2, 5, 10, '2024-01-05'),
    (4, 'WAREHOUSE-A-103', 150, 10, 50, 100, '2024-01-12'),
    (5, 'WAREHOUSE-A-104', 75, 8, 30, 50, '2024-01-11'),
    (6, 'WAREHOUSE-B-202', 40, 5, 15, 25, '2024-01-09'),
    (7, 'WAREHOUSE-C-301', 20, 2, 8, 15, '2024-01-07'),
    (8, 'WAREHOUSE-C-302', 35, 3, 10, 20, '2024-01-06'),
    (9, 'WAREHOUSE-D-401', 200, 20, 50, 100, '2024-01-13'),
    (10, 'WAREHOUSE-D-402', 100, 10, 30, 50, '2024-01-14'),
    (11, 'WAREHOUSE-A-105', 60, 6, 20, 30, '2024-01-15'),
    (12, 'WAREHOUSE-A-106', 80, 8, 25, 40, '2024-01-16'),
    (13, 'WAREHOUSE-A-107', 90, 9, 30, 50, '2024-01-17'),
    (14, 'WAREHOUSE-B-203', 55, 5, 20, 30, '2024-01-18'),
    (15, 'WAREHOUSE-A-108', 120, 12, 40, 60, '2024-01-19');
  `);

  // Seed reviews
  await db.none(`
    INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase, helpful_count, created_at) VALUES
    (1, 1, 5, 'Amazing laptop!', 'Best laptop I have ever owned. Fast and reliable.', true, 45, '2024-01-20'),
    (1, 3, 4, 'Great but pricey', 'Excellent performance but quite expensive.', true, 32, '2024-01-22'),
    (2, 2, 5, 'Perfect ultrabook', 'Light, fast, and beautiful display.', true, 28, '2024-01-18'),
    (3, 8, 5, 'Gaming beast', 'Runs everything at max settings. Worth the price!', false, 67, '2024-01-25'),
    (4, 1, 4, 'Good mouse', 'Comfortable and responsive. Battery life could be better.', true, 18, '2024-01-21'),
    (5, 2, 5, 'Best keyboard ever', 'Cherry MX switches feel amazing. RGB is a nice bonus.', true, 54, '2024-01-19'),
    (6, 3, 4, 'Great monitor', '4K quality is stunning. Some backlight bleed on edges.', true, 41, '2024-01-23'),
    (7, 10, 5, 'Life changer', 'My back pain is gone! Worth every penny.', true, 89, '2024-01-26'),
    (8, 14, 4, 'Comfortable chair', 'Good support but armrests could be better.', false, 34, '2024-01-24'),
    (11, 6, 5, 'Crystal clear audio', 'Noise canceling is incredible. Perfect for flights.', true, 112, '2024-01-22'),
    (11, 7, 4, 'Good but not perfect', 'Sound quality is excellent but they are heavy.', true, 78, '2024-01-27'),
    (12, 13, 5, 'Room-filling sound', '360-degree audio is amazing for parties.', true, 45, '2024-01-25'),
    (16, 9, 3, 'Overpriced', 'Good chair but too expensive for what it is.', false, 12, '2024-01-28');
  `);

  // Seed tags
  await db.none(`
    INSERT INTO tags (name, slug, usage_count) VALUES
    ('premium', 'premium', 15),
    ('budget', 'budget', 8),
    ('gaming', 'gaming', 12),
    ('productivity', 'productivity', 20),
    ('wireless', 'wireless', 18),
    ('ergonomic', 'ergonomic', 10),
    ('eco-friendly', 'eco-friendly', 6),
    ('bestseller', 'bestseller', 25),
    ('new-arrival', 'new-arrival', 14),
    ('clearance', 'clearance', 7),
    ('professional', 'professional', 16),
    ('home-office', 'home-office', 22);
  `);

  // Seed product_tags
  await db.none(`
    INSERT INTO product_tags (product_id, tag_id) VALUES
    (1, 1), (1, 4), (1, 8), (1, 11),
    (2, 1), (2, 4), (2, 11),
    (3, 1), (3, 3), (3, 8),
    (4, 5), (4, 6), (4, 12),
    (5, 3), (5, 4), (5, 11),
    (6, 1), (6, 4), (6, 11),
    (7, 6), (7, 12), (7, 11),
    (8, 1), (8, 6), (8, 12),
    (11, 1), (11, 5), (11, 8),
    (12, 5), (12, 8), (12, 9),
    (16, 3), (16, 6), (16, 9),
    (23, 1), (23, 3), (23, 8);
  `);

  // Seed some audit logs
  await db.none(`
    INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, user_id, ip_address) VALUES
    ('orders', 6, 'UPDATE', '{"status": "pending"}', '{"status": "cancelled"}', 5, '192.168.1.100'),
    ('products', 1, 'UPDATE', '{"price": 2399.99}', '{"price": 2499.99}', 22, '192.168.1.101'),
    ('users', 5, 'UPDATE', '{"is_active": true}', '{"is_active": false}', 5, '192.168.1.102'),
    ('users', 8, 'UPDATE', '{"is_active": true}', '{"is_active": false}', 8, '192.168.1.103'),
    ('orders', 3, 'UPDATE', '{"status": "processing"}', '{"status": "shipped"}', 1, '192.168.1.104'),
    ('inventory', 1, 'UPDATE', '{"quantity_on_hand": 30}', '{"quantity_on_hand": 25}', NULL, '192.168.1.105');
  `);
}

export async function cleanupTestDatabase(db: IDatabase<any>) {
  await setupExpandedTestDatabase(db);
}
