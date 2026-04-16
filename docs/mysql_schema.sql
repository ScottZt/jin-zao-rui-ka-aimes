SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS hamburger_mes DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE hamburger_mes;

DROP TABLE IF EXISTS `exception`;
DROP TABLE IF EXISTS `inventory_flow`;
DROP TABLE IF EXISTS `stock_out_item`;
DROP TABLE IF EXISTS `stock_out`;
DROP TABLE IF EXISTS `stock_in_item`;
DROP TABLE IF EXISTS `stock_in`;
DROP TABLE IF EXISTS `inventory`;
DROP TABLE IF EXISTS `work_report_item`;
DROP TABLE IF EXISTS `work_report`;
DROP TABLE IF EXISTS `work_order`;
DROP TABLE IF EXISTS `skill`;
DROP TABLE IF EXISTS `process`;
DROP TABLE IF EXISTS `product`;
DROP TABLE IF EXISTS `material`;
DROP TABLE IF EXISTS `user`;

CREATE TABLE `user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(64) NOT NULL,
  `card_id` VARCHAR(64) DEFAULT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'worker',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_card_id` (`card_id`),
  KEY `idx_user_role_status` (`role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `material` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `material_code` VARCHAR(64) NOT NULL,
  `material_name` VARCHAR(128) NOT NULL,
  `material_type` VARCHAR(32) NOT NULL,
  `unit` VARCHAR(16) NOT NULL,
  `safe_stock_qty` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_material_code` (`material_code`),
  KEY `idx_material_type` (`material_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `product` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_code` VARCHAR(64) NOT NULL,
  `product_name` VARCHAR(128) NOT NULL,
  `default_unit` VARCHAR(16) NOT NULL,
  `material_id` BIGINT UNSIGNED DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_code` (`product_code`),
  KEY `idx_product_material_id` (`material_id`),
  CONSTRAINT `fk_product_material` FOREIGN KEY (`material_id`) REFERENCES `material` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `process` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `process_code` VARCHAR(64) NOT NULL,
  `process_name` VARCHAR(128) NOT NULL,
  `unit` VARCHAR(16) NOT NULL,
  `min_skill_level` INT NOT NULL DEFAULT 1,
  `is_final_count` TINYINT(1) NOT NULL DEFAULT 0,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_process_code` (`process_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `skill` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `skill_level` INT NOT NULL DEFAULT 1,
  `tags_json` JSON DEFAULT NULL,
  `metrics_json` JSON DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_user_id` (`user_id`),
  KEY `idx_skill_level` (`skill_level`),
  CONSTRAINT `fk_skill_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `work_order` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_no` VARCHAR(64) NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `plan_qty` DECIMAL(18,4) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `start_time` DATETIME DEFAULT NULL,
  `end_time` DATETIME DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_order_no` (`work_order_no`),
  KEY `idx_work_order_status` (`status`),
  KEY `idx_work_order_product_id` (`product_id`),
  CONSTRAINT `fk_work_order_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `work_report` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_no` VARCHAR(64) NOT NULL,
  `work_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `reporter_user_id` BIGINT UNSIGNED NOT NULL,
  `shift_name` VARCHAR(16) NOT NULL,
  `report_time` DATETIME NOT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_report_no` (`report_no`),
  KEY `idx_work_report_work_order_id` (`work_order_id`),
  KEY `idx_work_report_reporter_time` (`reporter_user_id`, `report_time`),
  CONSTRAINT `fk_work_report_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_order` (`id`),
  CONSTRAINT `fk_work_report_reporter` FOREIGN KEY (`reporter_user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `work_report_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_report_id` BIGINT UNSIGNED NOT NULL,
  `employee_user_id` BIGINT UNSIGNED NOT NULL,
  `process_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `good_qty` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `bad_qty` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `loss_qty` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `shift_name` VARCHAR(16) NOT NULL,
  `equipment` VARCHAR(64) DEFAULT NULL,
  `skill_level` INT NOT NULL DEFAULT 1,
  `report_time` DATETIME NOT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_work_report_item_report_id` (`work_report_id`),
  KEY `idx_work_report_item_user_time` (`employee_user_id`, `report_time`),
  KEY `idx_work_report_item_process_time` (`process_id`, `report_time`),
  KEY `idx_work_report_item_product_time` (`product_id`, `report_time`),
  CONSTRAINT `fk_work_report_item_report` FOREIGN KEY (`work_report_id`) REFERENCES `work_report` (`id`),
  CONSTRAINT `fk_work_report_item_employee` FOREIGN KEY (`employee_user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_work_report_item_process` FOREIGN KEY (`process_id`) REFERENCES `process` (`id`),
  CONSTRAINT `fk_work_report_item_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `inventory` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `current_qty` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `locked_qty` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inventory_material_id` (`material_id`),
  CONSTRAINT `fk_inventory_material` FOREIGN KEY (`material_id`) REFERENCES `material` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `stock_in` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stock_in_no` VARCHAR(64) NOT NULL,
  `biz_type` VARCHAR(32) NOT NULL DEFAULT 'manual',
  `operator_user_id` BIGINT UNSIGNED NOT NULL,
  `work_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `stock_time` DATETIME NOT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stock_in_no` (`stock_in_no`),
  KEY `idx_stock_in_time` (`stock_time`),
  KEY `idx_stock_in_work_order_id` (`work_order_id`),
  CONSTRAINT `fk_stock_in_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_stock_in_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_order` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `stock_in_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stock_in_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `qty` DECIMAL(18,4) NOT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_stock_in_item_stock_in_id` (`stock_in_id`),
  KEY `idx_stock_in_item_material_id` (`material_id`),
  CONSTRAINT `fk_stock_in_item_stock_in` FOREIGN KEY (`stock_in_id`) REFERENCES `stock_in` (`id`),
  CONSTRAINT `fk_stock_in_item_material` FOREIGN KEY (`material_id`) REFERENCES `material` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `stock_out` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stock_out_no` VARCHAR(64) NOT NULL,
  `biz_type` VARCHAR(32) NOT NULL DEFAULT 'manual',
  `operator_user_id` BIGINT UNSIGNED NOT NULL,
  `work_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `stock_time` DATETIME NOT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stock_out_no` (`stock_out_no`),
  KEY `idx_stock_out_time` (`stock_time`),
  KEY `idx_stock_out_work_order_id` (`work_order_id`),
  CONSTRAINT `fk_stock_out_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_stock_out_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_order` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `stock_out_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stock_out_id` BIGINT UNSIGNED NOT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `qty` DECIMAL(18,4) NOT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_stock_out_item_stock_out_id` (`stock_out_id`),
  KEY `idx_stock_out_item_material_id` (`material_id`),
  CONSTRAINT `fk_stock_out_item_stock_out` FOREIGN KEY (`stock_out_id`) REFERENCES `stock_out` (`id`),
  CONSTRAINT `fk_stock_out_item_material` FOREIGN KEY (`material_id`) REFERENCES `material` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `inventory_flow` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `flow_no` VARCHAR(64) NOT NULL,
  `direction` VARCHAR(8) NOT NULL,
  `biz_type` VARCHAR(32) NOT NULL,
  `biz_id` BIGINT UNSIGNED DEFAULT NULL,
  `material_id` BIGINT UNSIGNED NOT NULL,
  `qty` DECIMAL(18,4) NOT NULL,
  `before_qty` DECIMAL(18,4) NOT NULL,
  `after_qty` DECIMAL(18,4) NOT NULL,
  `operator_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `work_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `flow_time` DATETIME NOT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inventory_flow_no` (`flow_no`),
  KEY `idx_inventory_flow_material_time` (`material_id`, `flow_time`),
  KEY `idx_inventory_flow_biz` (`biz_type`, `biz_id`),
  CONSTRAINT `fk_inventory_flow_material` FOREIGN KEY (`material_id`) REFERENCES `material` (`id`),
  CONSTRAINT `fk_inventory_flow_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_inventory_flow_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_order` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `exception` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exception_type` VARCHAR(32) NOT NULL,
  `severity` VARCHAR(16) NOT NULL DEFAULT 'normal',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `work_order_id` BIGINT UNSIGNED DEFAULT NULL,
  `work_report_item_id` BIGINT UNSIGNED DEFAULT NULL,
  `material_id` BIGINT UNSIGNED DEFAULT NULL,
  `equipment` VARCHAR(64) DEFAULT NULL,
  `description` VARCHAR(255) NOT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_exception_status_type` (`status`, `exception_type`),
  KEY `idx_exception_work_order_id` (`work_order_id`),
  CONSTRAINT `fk_exception_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_order` (`id`),
  CONSTRAINT `fk_exception_work_report_item` FOREIGN KEY (`work_report_item_id`) REFERENCES `work_report_item` (`id`),
  CONSTRAINT `fk_exception_material` FOREIGN KEY (`material_id`) REFERENCES `material` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

