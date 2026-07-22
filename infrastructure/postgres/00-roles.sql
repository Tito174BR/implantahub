DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'implantahub_migrator') THEN
    CREATE ROLE implantahub_migrator LOGIN PASSWORD 'implantahub_migrator';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'implantahub_api') THEN
    CREATE ROLE implantahub_api LOGIN PASSWORD 'implantahub_api';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE implantahub TO implantahub_migrator;
GRANT CONNECT ON DATABASE implantahub TO implantahub_api;
GRANT CREATE ON DATABASE implantahub TO implantahub_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO implantahub_migrator;
ALTER DATABASE implantahub SET timezone TO 'UTC';
