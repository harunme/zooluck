-- 创建数据库
CREATE DATABASE IF NOT EXISTS zooluck CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zooluck;

-- 创建奖品表
CREATE TABLE IF NOT EXISTS prizes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL COMMENT '奖品名称',
  image LONGTEXT COMMENT '奖品图片 (base64或emoji)',
  quantity INT NOT NULL DEFAULT 0 COMMENT '总数量',
  supplier VARCHAR(255) COMMENT '供应商',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_supplier (supplier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='奖品表';

-- 创建记录表
CREATE TABLE IF NOT EXISTS records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  prize_id INT COMMENT '奖品ID',
  phone VARCHAR(20) COMMENT '用户电话',
  vipcard VARCHAR(255) COMMENT '年卡号',
  quantity INT NOT NULL DEFAULT 1 COMMENT '领取数量',
  record_type VARCHAR(50) COMMENT '记录类型',
  status TINYINT DEFAULT 0 COMMENT '领取状态: 0=未领取, 1=已领取',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_prize_id (prize_id),
  KEY idx_phone (phone),
  KEY idx_vipcard (vipcard),
  KEY idx_created_at (created_at),
  FOREIGN KEY (prize_id) REFERENCES prizes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='奖品领取记录表';

-- 创建设置表
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(255) UNIQUE NOT NULL COMMENT '设置键',
  setting_value LONGTEXT COMMENT '设置值',
  description VARCHAR(255) COMMENT '描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统设置表';

-- 插入初始奖品数据
INSERT INTO prizes (name, image, quantity, supplier) VALUES
('卡通宝宝车', '📝', 15516, '大连森林动物园'),
('主题原创绘本（小恐马的调皮)', '🌿', 6176, '大连森林动物园'),
('主题原创绘本（大熊猫宝宝的秘密)', '📚', 5262, '大连森林动物园'),
('小本', '📋', 4926, '大连森林动物园'),
('Zoo记念盾牌', '☂️', 3451, '大连森林动物园');

-- 插入初始设置数据
INSERT INTO settings (setting_key, setting_value, description) VALUES
('redeem_password', '', '兑奖密码');


