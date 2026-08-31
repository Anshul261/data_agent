"""
Per-request user identity, available to code that has no access to the
Request object.

Chart images are written from inside Agno tool calls during an agent run,
which is several frames below the route handler. A ContextVar carries the
authenticated user id down to them without threading it through Agno, and
stays correct under concurrent requests (unlike module or instance state).
"""

from contextvars import ContextVar
from typing import Optional

_current_user_id: ContextVar[Optional[str]] = ContextVar(
    "current_user_id", default=None
)


def set_current_user_id(user_id: Optional[str]):
    """Set the user for this request. Returns a token for reset()."""
    return _current_user_id.set(user_id)


def get_current_user_id() -> Optional[str]:
    """The authenticated user id for the current request, if any."""
    return _current_user_id.get()


def reset_current_user_id(token) -> None:
    _current_user_id.reset(token)
