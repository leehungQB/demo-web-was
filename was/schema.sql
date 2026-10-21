-- ========================================================
-- Schema Database PostgreSQL cho Ứng dụng Demo 3-Tier
-- Ghi chú: Ứng dụng WAS đã TỰ ĐỘNG chạy câu lệnh này khi khởi động.
-- File này dùng để tham khảo hoặc nếu bạn muốn tạo thủ công bằng psql/DBeaver.
-- ========================================================

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dữ liệu mẫu ban đầu (Tùy chọn)
INSERT INTO items (title, content) 
VALUES 
    ('Khởi tạo hệ thống', 'Kiểm tra kết nối 3-Tier Web -> WAS -> PostgreSQL RDS thành công!'),
    ('AWS Architecture Demo', 'Chạy trên máy chủ EC2 t3.small (2 vCPU, 2GB RAM).')
ON CONFLICT DO NOTHING;
