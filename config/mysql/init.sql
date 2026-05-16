-- =============================================================================
--  LaunchOps Founder Edition — MariaDB Initialization Script
--  Runs automatically on first container start (empty data volume).
--
--  Creates all required databases and grants wpuser full access to each.
--  MariaDB's MYSQL_DATABASE env var only creates ONE database — this script
--  handles the rest.
-- =============================================================================

-- WordPress (created by MYSQL_DATABASE env var, but grant here for safety)
CREATE DATABASE IF NOT EXISTS wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SuiteCRM
CREATE DATABASE IF NOT EXISTS suitecrm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Mautic
CREATE DATABASE IF NOT EXISTS mautic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Matomo
CREATE DATABASE IF NOT EXISTS matomo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Control Tower (infrastructure monitoring dashboard)
CREATE DATABASE IF NOT EXISTS control_tower CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Grant wpuser full access to all LaunchOps databases
GRANT ALL PRIVILEGES ON wordpress.*     TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON suitecrm.*      TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON mautic.*        TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON matomo.*        TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON control_tower.* TO 'wpuser'@'%';

FLUSH PRIVILEGES;
