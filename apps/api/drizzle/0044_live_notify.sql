-- Live updates: every new notification is announced on the 'collabiz_live' channel so the API can push it to the
-- signed-in user over server-sent events straight away (chat messages already create a notification per recipient).
CREATE OR REPLACE FUNCTION collabiz_notify_live() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('collabiz_live', json_build_object('u', NEW.user_id, 'k', NEW.kind, 't', left(NEW.title, 140), 'l', NEW.link, 'id', NEW.id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS notifications_live ON notifications;
--> statement-breakpoint
CREATE TRIGGER notifications_live AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION collabiz_notify_live();
