"""
Test rooms API endpoints in the Meet core app: participants preview (pre-join screen).
"""

# pylint: disable=redefined-outer-name,unused-argument,no-name-in-module

import asyncio
from unittest import mock

import pytest
from livekit.api import ListParticipantsResponse, TwirpError
from livekit.protocol.models import ParticipantInfo, ParticipantPermission
from rest_framework.test import APIClient

from core.factories import RoomFactory, UserFactory, UserResourceAccessFactory
from core.models import RoomAccessLevel

pytestmark = pytest.mark.django_db


@pytest.fixture
def mock_livekit_client():
    """Mock LiveKit API client."""
    with mock.patch("core.utils.create_livekit_client") as mock_create:
        mock_client = mock.AsyncMock()
        mock_create.return_value = mock_client
        yield mock_client


def _url(room):
    return f"/api/v1.0/rooms/{room.id!s}/participants-preview/"


def _participant(name, kind=ParticipantInfo.Kind.STANDARD, **kwargs):
    return ParticipantInfo(
        identity="4f2b3c1e-secret-identity",
        name=name,
        kind=kind,
        state=kwargs.pop("state", ParticipantInfo.State.ACTIVE),
        attributes={"color": "hsl(10, 50%, 50%)"},
        **kwargs,
    )


def test_participants_preview_public_room_lists_humans_only(mock_livekit_client):
    """Only visible humans come back, as names and colors, never identities."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_participants.return_value = ListParticipantsResponse(
        participants=[
            _participant("Carlos Ferri"),
            _participant(""),
            _participant("Phone", kind=ParticipantInfo.Kind.SIP),
            _participant("Recorder", kind=ParticipantInfo.Kind.EGRESS),
            _participant("Bot", kind=ParticipantInfo.Kind.AGENT),
            _participant("Ghost", permission=ParticipantPermission(hidden=True)),
            _participant("Gone", state=ParticipantInfo.State.DISCONNECTED),
        ]
    )

    response = APIClient().get(_url(room))

    assert response.status_code == 200
    assert response.json() == {
        "count": 3,
        "available": True,
        "participants": [
            {"name": "Carlos Ferri", "color": "hsl(10, 50%, 50%)"},
            {"name": None, "color": "hsl(10, 50%, 50%)"},
            {"name": "Phone", "color": "hsl(10, 50%, 50%)"},
        ],
    }
    assert "secret-identity" not in response.content.decode()
    request = mock_livekit_client.room.list_participants.call_args.args[0]
    assert request.room == str(room.id)
    mock_livekit_client.aclose.assert_called_once()


def test_participants_preview_by_slug(mock_livekit_client):
    """The frontend addresses rooms by slug, like the retrieve endpoint."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_participants.return_value = ListParticipantsResponse()

    response = APIClient().get(f"/api/v1.0/rooms/{room.slug}/participants-preview/")

    assert response.status_code == 200
    assert response.json() == {"count": 0, "participants": [], "available": True}


@pytest.mark.parametrize(
    "access_level", [RoomAccessLevel.RESTRICTED, RoomAccessLevel.TRUSTED]
)
def test_participants_preview_anonymous_lobby_forbidden(
    mock_livekit_client, access_level
):
    """Anonymous users who would wait in the lobby do not learn who is inside."""
    room = RoomFactory(access_level=access_level)

    response = APIClient().get(_url(room))

    assert response.status_code == 403
    mock_livekit_client.room.list_participants.assert_not_called()


def test_participants_preview_authenticated_restricted_no_role_forbidden(
    mock_livekit_client,
):
    """A logged-in stranger to a restricted room goes to the lobby: no preview."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    client = APIClient()
    client.force_authenticate(UserFactory())

    response = client.get(_url(room))

    assert response.status_code == 403
    mock_livekit_client.room.list_participants.assert_not_called()


def test_participants_preview_authenticated_trusted_allowed(mock_livekit_client):
    """Trusted rooms let any logged-in user in, so they may see who is there."""
    room = RoomFactory(access_level=RoomAccessLevel.TRUSTED)
    mock_livekit_client.room.list_participants.return_value = ListParticipantsResponse()
    client = APIClient()
    client.force_authenticate(UserFactory())

    assert client.get(_url(room)).status_code == 200


def test_participants_preview_member_restricted_allowed(mock_livekit_client):
    """Members of a restricted room join directly, so they get the preview."""
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    user = UserFactory()
    UserResourceAccessFactory(resource=room, user=user, role="member")
    mock_livekit_client.room.list_participants.return_value = ListParticipantsResponse(
        participants=[_participant("Carlos Ferri")]
    )
    client = APIClient()
    client.force_authenticate(user)

    response = client.get(_url(room))

    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_participants_preview_livekit_room_not_found(mock_livekit_client):
    """A room LiveKit has not created yet is simply empty."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_participants.side_effect = TwirpError(
        msg="requested room does not exist", code="not_found", status=404
    )

    response = APIClient().get(_url(room))

    assert response.status_code == 200
    assert response.json() == {"count": 0, "participants": [], "available": True}
    mock_livekit_client.aclose.assert_called_once()


@pytest.mark.parametrize(
    "error",
    [
        TwirpError(msg="boom", code="internal", status=500),
        asyncio.TimeoutError(),
        OSError("connection refused"),
    ],
)
def test_participants_preview_livekit_failure_degrades(mock_livekit_client, error):
    """LiveKit trouble never breaks the pre-join screen: 200, empty, flagged."""
    room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    mock_livekit_client.room.list_participants.side_effect = error

    response = APIClient().get(_url(room))

    assert response.status_code == 200
    assert response.json() == {"count": 0, "participants": [], "available": False}
    mock_livekit_client.aclose.assert_called_once()
