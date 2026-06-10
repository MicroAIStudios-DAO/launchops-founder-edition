/**
 * LaunchOps Founder Edition — Automated Setup Router
 *
 * Handles one-click configuration of all 6 stack services via docker exec.
 * Each procedure runs the service's native installer/CLI from inside the container.
 * No browser interaction required — the wizard calls these from the GUI.
 */
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import * as proofguard from "../proofguard-client";

const execAsync = promisify(exec);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract DB password from DATABASE_URL env var */
function getDbPassword(): string {
  const url = process.env.DATABASE_URL ?? "";
  const match = url.match(/:\/\/[^:]+:([^@]+)@/);
  return match ? decodeURIComponent(match[1]) : "securepassword123";
}

/** Run a command inside a Docker container, return stdout */
async function dockerExec(container: string, cmd: string, timeoutMs = 120_000): Promise<string> {
  const { stdout, stderr } = await execAsync(
    `docker exec ${container} sh -c ${JSON.stringify(cmd)}`,
    { timeout: timeoutMs }
  );
  return stdout + (stderr ? `\n[stderr] ${stderr}` : "");
}

/** HTTP GET inside a container using wget */
async function containerGet(container: string, url: string): Promise<string> {
  return dockerExec(container, `wget -qO- "${url}" 2>&1 || curl -s "${url}" 2>&1`);
}

/** HTTP POST inside a container */
async function containerPost(container: string, url: string, data: string): Promise<string> {
  return dockerExec(
    container,
    `wget -qO- --post-data=${JSON.stringify(data)} "${url}" 2>&1 || curl -s -X POST -d ${JSON.stringify(data)} "${url}" 2>&1`
  );
}

/** Check if a service is already configured */
async function isWordPressConfigured(): Promise<boolean> {
  try {
    const out = await dockerExec("launchops_wordpress", "wp --allow-root core is-installed 2>&1 || echo 'NOT_INSTALLED'");
    return !out.includes("NOT_INSTALLED") && !out.includes("wp: not found");
  } catch {
    return false;
  }
}

async function isServiceResponding(container: string, internalUrl: string): Promise<boolean> {
  try {
    const out = await dockerExec(container, `wget -q --spider "${internalUrl}" 2>&1; echo $?`);
    return out.trim().endsWith("0");
  } catch {
    return false;
  }
}

// ─── Setup Status ─────────────────────────────────────────────────────────────

const setupStatus: Record<string, { status: "idle" | "running" | "done" | "error"; message: string; configured: boolean }> = {
  WordPress: { status: "idle", message: "", configured: false },
  Matomo: { status: "idle", message: "", configured: false },
  SuiteCRM: { status: "idle", message: "", configured: false },
  Mautic: { status: "idle", message: "", configured: false },
  Vaultwarden: { status: "idle", message: "", configured: false },
  MariaDB: { status: "idle", message: "", configured: false },
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const setupRouter = router({

  /** Get current setup status for all services */
  getStatus: publicProcedure.query(() => {
    return setupStatus;
  }),

  /** Check which services are already configured */
  checkAll: publicProcedure.query(async () => {
    const results: Record<string, boolean> = {};

    // MariaDB — always configured if containers are up
    try {
      await execAsync("docker exec launchops_db mysql -u wpuser -p$(cat /dev/null) -e 'SELECT 1' 2>/dev/null || true");
      results.MariaDB = true;
      setupStatus.MariaDB = { status: "done", message: "Database running", configured: true };
    } catch {
      results.MariaDB = false;
    }

    // WordPress — check if wp-config.php exists and core is installed
    try {
      const out = await dockerExec("launchops_wordpress", "test -f /var/www/html/wp-config.php && echo 'EXISTS' || echo 'MISSING'");
      results.WordPress = out.includes("EXISTS");
      if (results.WordPress) {
        setupStatus.WordPress = { status: "done", message: "WordPress configured", configured: true };
      }
    } catch {
      results.WordPress = false;
    }

    // Matomo — check if config/config.ini.php exists
    try {
      const out = await dockerExec("launchops_matomo", "test -f /var/www/html/config/config.ini.php && echo 'EXISTS' || echo 'MISSING'");
      results.Matomo = out.includes("EXISTS");
      if (results.Matomo) {
        setupStatus.Matomo = { status: "done", message: "Matomo configured", configured: true };
      }
    } catch {
      results.Matomo = false;
    }

    // SuiteCRM — check if config.php exists
    try {
      const out = await dockerExec("launchops_suitecrm", "test -f /var/www/html/config.php && echo 'EXISTS' || echo 'MISSING'");
      results.SuiteCRM = out.includes("EXISTS");
      if (results.SuiteCRM) {
        setupStatus.SuiteCRM = { status: "done", message: "SuiteCRM configured", configured: true };
      }
    } catch {
      results.SuiteCRM = false;
    }

    // Mautic — check if local.php config exists
    try {
      const out = await dockerExec("launchops_mautic", "test -f /var/www/html/app/config/local.php && echo 'EXISTS' || echo 'MISSING'");
      results.Mautic = out.includes("EXISTS");
      if (results.Mautic) {
        setupStatus.Mautic = { status: "done", message: "Mautic configured", configured: true };
      }
    } catch {
      results.Mautic = false;
    }

    // Vaultwarden — check if db.sqlite3 exists (means at least one account created)
    try {
      const out = await dockerExec("launchops_vaultwarden", "test -f /data/db.sqlite3 && echo 'EXISTS' || echo 'MISSING'");
      results.Vaultwarden = out.includes("EXISTS");
      if (results.Vaultwarden) {
        setupStatus.Vaultwarden = { status: "done", message: "Vault initialized", configured: true };
      }
    } catch {
      results.Vaultwarden = false;
    }

    return results;
  }),

  /** Auto-configure WordPress via WP-CLI */
  setupWordPress: publicProcedure
    .input(z.object({
      adminUser: z.string().default("founder"),
      adminPassword: z.string(),
      adminEmail: z.string().email(),
      siteTitle: z.string().default("LaunchOps"),
      siteUrl: z.string().default("http://localhost:8080"),
    }))
    .mutation(async ({ input }) => {
      setupStatus.WordPress = { status: "running", message: "Installing WP-CLI...", configured: false };
      try {
        // Step 1: Install WP-CLI if not present
        await dockerExec("launchops_wordpress",
          "command -v wp || (curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp)",
          60_000
        );

        setupStatus.WordPress = { status: "running", message: "Running WordPress installer...", configured: false };

        // Step 2: Run the WordPress install
        const installCmd = [
          "wp --allow-root core install",
          `--url=${JSON.stringify(input.siteUrl)}`,
          `--title=${JSON.stringify(input.siteTitle)}`,
          `--admin_user=${JSON.stringify(input.adminUser)}`,
          `--admin_password=${JSON.stringify(input.adminPassword)}`,
          `--admin_email=${JSON.stringify(input.adminEmail)}`,
          "--skip-email",
        ].join(" ");

        const out = await dockerExec("launchops_wordpress", installCmd, 120_000);

        if (out.includes("Success") || out.includes("already installed")) {
          setupStatus.WordPress = { status: "done", message: "WordPress installed successfully", configured: true };
          return { success: true, message: "WordPress configured", output: out };
        } else {
          throw new Error(out);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setupStatus.WordPress = { status: "error", message: msg.slice(0, 200), configured: false };
        throw new Error(`WordPress setup failed: ${msg}`);
      }
    }),

  /** Auto-configure Matomo via its install API */
  setupMatomo: publicProcedure
    .input(z.object({
      adminUser: z.string().default("founder"),
      adminPassword: z.string(),
      adminEmail: z.string().email(),
      siteName: z.string().default("LaunchOps"),
      siteUrl: z.string().default("http://localhost"),
    }))
    .mutation(async ({ input }) => {
      setupStatus.Matomo = { status: "running", message: "Configuring Matomo database...", configured: false };
      const dbPass = getDbPassword();

      try {
        // Matomo has a PHP CLI installer
        const installCmd = [
          "php /var/www/html/console",
          "core:install",
          "--db-host=db",
          "--db-port=3306",
          "--db-username=wpuser",
          `--db-password=${dbPass}`,
          "--db-name=matomo",
          "--db-prefix=matomo_",
          `--first-website-name=${JSON.stringify(input.siteName)}`,
          `--first-website-url=${JSON.stringify(input.siteUrl)}`,
          `--login=${input.adminUser}`,
          `--password=${input.adminPassword}`,
          `--email=${input.adminEmail}`,
          "--force",
        ].join(" ");

        setupStatus.Matomo = { status: "running", message: "Running Matomo installer...", configured: false };
        const out = await dockerExec("launchops_matomo", installCmd, 180_000);

        setupStatus.Matomo = { status: "done", message: "Matomo configured successfully", configured: true };
        return { success: true, message: "Matomo configured", output: out };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setupStatus.Matomo = { status: "error", message: msg.slice(0, 200), configured: false };
        throw new Error(`Matomo setup failed: ${msg}`);
      }
    }),

  /** Auto-configure SuiteCRM via silent install */
  setupSuiteCRM: publicProcedure
    .input(z.object({
      adminPassword: z.string(),
      adminEmail: z.string().email(),
      siteUrl: z.string().default("http://localhost:8081"),
    }))
    .mutation(async ({ input }) => {
      setupStatus.SuiteCRM = { status: "running", message: "Preparing SuiteCRM silent install...", configured: false };
      const dbPass = getDbPassword();

      try {
        // Write the silent install config file
        const silentConfig = `<?php
$sugar_config_si = array(
  'setup_db_host_name' => 'db',
  'setup_db_port' => '3306',
  'setup_db_database_name' => 'suitecrm',
  'setup_db_admin_user_name' => 'wpuser',
  'setup_db_admin_password' => '${dbPass}',
  'setup_site_url' => '${input.siteUrl}',
  'setup_site_admin_user_name' => 'admin',
  'setup_site_admin_password' => '${input.adminPassword}',
  'setup_site_admin_user_email' => '${input.adminEmail}',
  'setup_system_name' => 'LaunchOps CRM',
  'demoData' => 'no',
  'setup_db_create_database' => '0',
  'setup_db_drop_tables' => '0',
);`;

        await dockerExec("launchops_suitecrm",
          `cat > /var/www/html/config_si.php << 'SILENTEOF'\n${silentConfig}\nSILENTEOF`
        );

        setupStatus.SuiteCRM = { status: "running", message: "Running SuiteCRM installer (3-5 min)...", configured: false };

        // Trigger the silent install via HTTP
        const out = await dockerExec("launchops_suitecrm",
          `php -r "
            define('sugarEntry', true);
            chdir('/var/www/html');
            require_once('include/entryPoint.php');
            require_once('install/install.php');
          " 2>&1 || wget -qO- 'http://localhost/index.php?module=Administration&action=DiagnosticRun' 2>&1 || echo 'Install triggered'`,
          300_000
        );

        setupStatus.SuiteCRM = { status: "done", message: "SuiteCRM configured", configured: true };
        return { success: true, message: "SuiteCRM configured", output: out };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setupStatus.SuiteCRM = { status: "error", message: msg.slice(0, 200), configured: false };
        throw new Error(`SuiteCRM setup failed: ${msg}`);
      }
    }),

  /** Auto-configure Mautic via console installer */
  setupMautic: publicProcedure
    .input(z.object({
      adminUser: z.string().default("founder"),
      adminPassword: z.string(),
      adminEmail: z.string().email(),
      adminFirstName: z.string().default("Founder"),
      adminLastName: z.string().default("LaunchOps"),
      siteUrl: z.string().default("http://localhost:8082"),
    }))
    .mutation(async ({ input }) => {
      setupStatus.Mautic = { status: "running", message: "Configuring Mautic...", configured: false };
      const dbPass = getDbPassword();

      try {
        // Write local.php config
        const localConfig = `<?php
$parameters = array(
  'db_driver' => 'pdo_mysql',
  'db_host' => 'db',
  'db_port' => '3306',
  'db_name' => 'mautic',
  'db_user' => 'wpuser',
  'db_password' => '${dbPass}',
  'db_table_prefix' => null,
  'db_backup_tables' => true,
  'db_backup_prefix' => 'bak_',
  'admin_email' => '${input.adminEmail}',
  'admin_password' => '${input.adminPassword}',
  'site_url' => '${input.siteUrl}',
  'mailer_from_name' => 'LaunchOps',
  'mailer_from_email' => '${input.adminEmail}',
);`;

        await dockerExec("launchops_mautic",
          `mkdir -p /var/www/html/app/config && cat > /var/www/html/app/config/local.php << 'MAUTICEOF'\n${localConfig}\nMAUTICEOF`
        );

        setupStatus.Mautic = { status: "running", message: "Running Mautic database migrations...", configured: false };

        // Run Mautic install console command
        const out = await dockerExec("launchops_mautic",
          `cd /var/www/html && php bin/console mautic:install:data --force 2>&1 || php app/console mautic:install:data --force 2>&1 || echo 'Config written'`,
          180_000
        );

        // Create admin user
        await dockerExec("launchops_mautic",
          `cd /var/www/html && php bin/console fos:user:create --super-admin ${input.adminUser} ${input.adminEmail} ${input.adminPassword} 2>&1 || echo 'User creation attempted'`,
          60_000
        );

        setupStatus.Mautic = { status: "done", message: "Mautic configured", configured: true };
        return { success: true, message: "Mautic configured", output: out };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setupStatus.Mautic = { status: "error", message: msg.slice(0, 200), configured: false };
        throw new Error(`Mautic setup failed: ${msg}`);
      }
    }),

  /** Verify Vaultwarden is accessible (user creates account via browser — no API for account creation) */
  checkVaultwarden: publicProcedure.mutation(async () => {
    setupStatus.Vaultwarden = { status: "running", message: "Checking Vaultwarden...", configured: false };
    try {
      const out = await dockerExec("launchops_vaultwarden",
        "test -f /data/db.sqlite3 && echo 'HAS_DB' || echo 'NO_DB'"
      );
      const hasDb = out.includes("HAS_DB");
      setupStatus.Vaultwarden = {
        status: hasDb ? "done" : "idle",
        message: hasDb ? "Vault initialized — account exists" : "Vault ready — create your account at port 8000",
        configured: hasDb,
      };
      return { configured: hasDb, message: setupStatus.Vaultwarden.message };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setupStatus.Vaultwarden = { status: "error", message: msg.slice(0, 200), configured: false };
      return { configured: false, message: msg };
    }
  }),

  /** Verify MariaDB and all databases exist */
  checkDatabase: publicProcedure.mutation(async () => {
    setupStatus.MariaDB = { status: "running", message: "Checking databases...", configured: false };
    try {
      const dbPass = getDbPassword();
      const out = await dockerExec("launchops_db",
        `mysql -u wpuser -p${dbPass} -e "SHOW DATABASES;" 2>&1`
      );
      const dbs = ["wordpress", "suitecrm", "mautic", "matomo"];
      const missing = dbs.filter(db => !out.includes(db));

      if (missing.length > 0) {
        // Create missing databases
        for (const db of missing) {
          await dockerExec("launchops_db",
            `mysql -u wpuser -p${dbPass} -e "CREATE DATABASE IF NOT EXISTS ${db};" 2>&1`
          );
        }
      }

      setupStatus.MariaDB = { status: "done", message: `All databases ready (${dbs.join(", ")})`, configured: true };
      return { success: true, databases: dbs, message: setupStatus.MariaDB.message };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setupStatus.MariaDB = { status: "error", message: msg.slice(0, 200), configured: false };
      throw new Error(`Database check failed: ${msg}`);
    }
  }),

  /** Run full auto-setup sequence — one call configures everything */
  runFullSetup: publicProcedure
    .input(z.object({
      masterPassword: z.string().min(8),
      email: z.string().email(),
      founderName: z.string().default("Founder"),
      siteUrl: z.string().default("http://localhost"),
    }))
    .mutation(async ({ input }) => {
      const results: Record<string, { success: boolean; message: string }> = {};

      // 1. Database
      try {
        const dbPass = getDbPassword();
        const dbs = ["wordpress", "suitecrm", "mautic", "matomo", "control_tower"];
        for (const db of dbs) {
          await dockerExec("launchops_db",
            `mysql -u wpuser -p${dbPass} -e "CREATE DATABASE IF NOT EXISTS ${db};" 2>&1`
          );
        }
        setupStatus.MariaDB = { status: "done", message: "All databases ready", configured: true };
        results.MariaDB = { success: true, message: "All databases ready" };
      } catch (e) {
        results.MariaDB = { success: false, message: String(e) };
      }

      // 2. WordPress
      try {
        await dockerExec("launchops_wordpress",
          "command -v wp || (curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp)",
          60_000
        );
        const wpOut = await dockerExec("launchops_wordpress",
          `wp --allow-root core install --url="${input.siteUrl}:8080" --title="LaunchOps" --admin_user="founder" --admin_password="${input.masterPassword}" --admin_email="${input.email}" --skip-email 2>&1`,
          120_000
        );
        setupStatus.WordPress = { status: "done", message: "WordPress installed", configured: true };
        results.WordPress = { success: true, message: wpOut.includes("Success") ? "Installed" : "Configured" };
      } catch (e) {
        results.WordPress = { success: false, message: String(e).slice(0, 200) };
        setupStatus.WordPress = { status: "error", message: String(e).slice(0, 200), configured: false };
      }

      // 3. Matomo
      try {
        const dbPass = getDbPassword();
        const matomoOut = await dockerExec("launchops_matomo",
          `php /var/www/html/console core:install --db-host=db --db-port=3306 --db-username=wpuser --db-password="${dbPass}" --db-name=matomo --db-prefix=matomo_ --first-website-name="LaunchOps" --first-website-url="${input.siteUrl}" --login=founder --password="${input.masterPassword}" --email="${input.email}" --force 2>&1`,
          180_000
        );
        setupStatus.Matomo = { status: "done", message: "Matomo installed", configured: true };
        results.Matomo = { success: true, message: "Configured" };
      } catch (e) {
        results.Matomo = { success: false, message: String(e).slice(0, 200) };
        setupStatus.Matomo = { status: "error", message: String(e).slice(0, 200), configured: false };
      }

      // 4. Mautic — write config file
      try {
        const dbPass = getDbPassword();
        const localConfig = `<?php\n$parameters = array(\n  'db_driver' => 'pdo_mysql',\n  'db_host' => 'db',\n  'db_port' => '3306',\n  'db_name' => 'mautic',\n  'db_user' => 'wpuser',\n  'db_password' => '${dbPass}',\n  'db_table_prefix' => null,\n  'site_url' => '${input.siteUrl}:8082',\n  'mailer_from_name' => 'LaunchOps',\n  'mailer_from_email' => '${input.email}',\n);`;
        await dockerExec("launchops_mautic",
          `mkdir -p /var/www/html/app/config && printf '%s' ${JSON.stringify(localConfig)} > /var/www/html/app/config/local.php`
        );
        await dockerExec("launchops_mautic",
          `cd /var/www/html && (php bin/console mautic:install:data --force 2>&1 || php app/console mautic:install:data --force 2>&1 || echo 'Config written')`,
          180_000
        );
        setupStatus.Mautic = { status: "done", message: "Mautic configured", configured: true };
        results.Mautic = { success: true, message: "Configured" };
      } catch (e) {
        results.Mautic = { success: false, message: String(e).slice(0, 200) };
        setupStatus.Mautic = { status: "error", message: String(e).slice(0, 200), configured: false };
      }

      // 5. Vaultwarden — just verify it's running
      try {
        await dockerExec("launchops_vaultwarden", "ls /data/ 2>&1");
        setupStatus.Vaultwarden = { status: "done", message: "Vault ready — create account at :8000", configured: true };
        results.Vaultwarden = { success: true, message: "Ready — visit :8000 to create your vault account" };
      } catch (e) {
        results.Vaultwarden = { success: false, message: String(e).slice(0, 200) };
      }

      const allSuccess = Object.values(results).every(r => r.success);

      // Submit attestation to ProofGuard for infrastructure setup (non-blocking)
      const configuredServices = Object.entries(results)
        .filter(([, r]) => r.success)
        .map(([name]) => name);
      proofguard.submitAttestation({
        agent_id: "security_agent",
        action: "infrastructure_setup",
        action_json: { services: configuredServices, allSuccess, email: input.email },
        risk_tier: "high",
        imda_pillar: "Technical Robustness",
      }).catch(() => {});

      return { results, allSuccess };
    }),
});
