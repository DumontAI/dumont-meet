from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db import migrations
from django.db.models import F
from django.utils import timezone

# The generated room code format from generateRoomId: three letters, four
# letters, three letters, joined by hyphens.
GENERATED_ROOM_NAME = r"^[a-z]{3}-[a-z]{4}-[a-z]{3}$"


def name_generated_rooms(apps, schema_editor):
    """Give rooms created with a code as their name a readable date label.

    The slug is the join link and is left untouched. Reverse is a no-op: the
    original code is not recoverable from the new label once the room is
    renamed by hand, and restoring it would be worse than keeping the label.
    """
    Room = apps.get_model("core", "Room")
    rooms = Room.all_objects.filter(name=F("slug"), name__regex=GENERATED_ROOM_NAME)

    for room in rooms:
        owner = room.accesses.filter(role="owner").select_related("user").first()
        tz = (
            owner.user.timezone if owner and owner.user.timezone else settings.TIME_ZONE
        )
        if isinstance(tz, str):
            try:
                tz = ZoneInfo(tz)
            except ZoneInfoNotFoundError:
                tz = ZoneInfo(settings.TIME_ZONE)
        created_at = timezone.localtime(room.created_at, timezone=tz)
        room.name = f"Meeting {created_at:%Y-%m-%d %H:%M}"
        room.save(update_fields=["name"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0029_alter_application_client_secret_sha256"),
    ]

    operations = [
        migrations.RunPython(name_generated_rooms, migrations.RunPython.noop),
    ]
