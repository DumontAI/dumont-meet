"""
Test the recording accesses API endpoint: list, invite by email and revoke.
"""

import pytest
from rest_framework.test import APIClient

from ...factories import RecordingFactory, UserFactory, UserRecordingAccessFactory
from ...models import RecordingAccess

pytestmark = pytest.mark.django_db


def accesses_url(recording):
    """Return the accesses endpoint URL for a recording."""
    return f"/api/v1.0/recordings/{recording.id!s}/accesses/"


def test_api_recording_accesses_anonymous():
    """Anonymous users cannot use the accesses action."""
    recording = RecordingFactory()
    client = APIClient()

    assert client.get(accesses_url(recording)).status_code == 401
    assert (
        client.post(accesses_url(recording), {"email": "a@example.com"}).status_code
        == 401
    )


def test_api_recording_accesses_non_related_404():
    """A user with no access row gets a 404, not the access list."""
    recording = RecordingFactory()
    client = APIClient()
    client.force_login(UserFactory())

    response = client.get(accesses_url(recording))
    assert response.status_code == 404


def test_api_recording_accesses_member_forbidden():
    """A member can download the recording but cannot manage its accesses."""
    user = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=user, role="member")

    client = APIClient()
    client.force_login(user)

    assert client.get(accesses_url(recording)).status_code == 403
    assert (
        client.post(accesses_url(recording), {"email": "a@example.com"}).status_code
        == 403
    )


def test_api_recording_accesses_owner_lists():
    """An owner sees the current per-user accesses."""
    user = UserFactory()
    recording = RecordingFactory()
    access = UserRecordingAccessFactory(recording=recording, user=user, role="owner")
    member = UserRecordingAccessFactory(recording=recording, role="member")

    client = APIClient()
    client.force_login(user)

    response = client.get(accesses_url(recording))
    assert response.status_code == 200
    assert {a["id"] for a in response.json()} == {
        str(access.id),
        str(member.id),
    }


def test_api_recording_accesses_owner_invites_by_email(settings):
    """An owner grants access to an existing user, who can then retrieve it."""
    settings.RECORDING_EXPIRATION_DAYS = None
    owner = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=owner, role="owner")
    invitee = UserFactory(email="invitee@example.com")

    client = APIClient()
    client.force_login(owner)

    response = client.post(
        accesses_url(recording), {"email": "INVITEE@example.com"}, format="json"
    )
    assert response.status_code == 201
    assert response.json()["user"]["id"] == str(invitee.id)
    assert response.json()["role"] == "member"

    access = RecordingAccess.objects.get(recording=recording, user=invitee)
    assert access.role == "member"

    invitee_client = APIClient()
    invitee_client.force_login(invitee)
    assert (
        invitee_client.get(f"/api/v1.0/recordings/{recording.id!s}/").status_code == 200
    )


def test_api_recording_accesses_unknown_email():
    """Inviting an email that belongs to no user is rejected."""
    owner = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=owner, role="owner")

    client = APIClient()
    client.force_login(owner)

    response = client.post(
        accesses_url(recording), {"email": "ghost@example.com"}, format="json"
    )
    assert response.status_code == 400
    assert "email" in response.json()


def test_api_recording_accesses_duplicate_email():
    """Inviting a user who already has access is rejected."""
    owner = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=owner, role="owner")
    invitee = UserFactory()
    UserRecordingAccessFactory(recording=recording, user=invitee, role="member")

    client = APIClient()
    client.force_login(owner)

    response = client.post(
        accesses_url(recording), {"email": invitee.email}, format="json"
    )
    assert response.status_code == 400
    assert "email" in response.json()


def test_api_recording_accesses_cannot_grant_owner():
    """Ownership is not transferable through this action."""
    owner = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=owner, role="owner")
    invitee = UserFactory()

    client = APIClient()
    client.force_login(owner)

    response = client.post(
        accesses_url(recording),
        {"email": invitee.email, "role": "owner"},
        format="json",
    )
    assert response.status_code == 400
    assert "role" in response.json()


def test_api_recording_accesses_owner_revokes():
    """Removing an access revokes the invitee's retrieval on the next request."""
    owner = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=owner, role="owner")
    invitee = UserFactory()
    access = UserRecordingAccessFactory(
        recording=recording, user=invitee, role="member"
    )

    client = APIClient()
    client.force_login(owner)

    response = client.delete(f"{accesses_url(recording)}?access_id={access.id!s}")
    assert response.status_code == 204
    assert not RecordingAccess.objects.filter(id=access.id).exists()

    invitee_client = APIClient()
    invitee_client.force_login(invitee)
    assert (
        invitee_client.get(f"/api/v1.0/recordings/{recording.id!s}/").status_code == 404
    )


def test_api_recording_accesses_cannot_remove_last_owner():
    """A recording keeps at least one owner."""
    owner = UserFactory()
    recording = RecordingFactory()
    access = UserRecordingAccessFactory(recording=recording, user=owner, role="owner")

    client = APIClient()
    client.force_login(owner)

    response = client.delete(f"{accesses_url(recording)}?access_id={access.id!s}")
    assert response.status_code == 400
    assert RecordingAccess.objects.filter(id=access.id).exists()


def test_api_recording_accesses_unknown_access_id_404():
    """An unknown access id is a 404, and a malformed one does not 500."""
    owner = UserFactory()
    recording = RecordingFactory()
    UserRecordingAccessFactory(recording=recording, user=owner, role="owner")

    client = APIClient()
    client.force_login(owner)

    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        client.delete(f"{accesses_url(recording)}?access_id={missing}").status_code
        == 404
    )
    assert (
        client.delete(f"{accesses_url(recording)}?access_id=not-a-uuid").status_code
        == 404
    )
