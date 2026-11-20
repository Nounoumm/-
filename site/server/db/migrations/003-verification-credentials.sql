ALTER TABLE auth_tokens ADD COLUMN pending_password_hash TEXT;
ALTER TABLE auth_tokens ADD COLUMN pending_display_name TEXT;
-- Prior verification links did not bind credentials to a registration. Require
-- new registration links rather than activating an older unbound password.
UPDATE auth_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE purpose = 'verify' AND used_at IS NULL;
