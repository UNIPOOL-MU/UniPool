"""Contract guard for endpoints the shipped UniPool frontend depends on.

If a frontend control points at an endpoint that is removed, renamed, or registered
under the wrong prefix, CI should fail before the UI ships a dead control.
"""

from app import app


def _routes():
    return {(method.upper(), route.path) for route in app.routes for method in (getattr(route, "methods", None) or [])}


def test_frontend_required_api_routes_exist():
    routes = _routes()
    required = {
        ("POST", "/api/auth/google"), ("GET", "/api/auth/microsoft/config"), ("POST", "/api/auth/microsoft"),
        ("POST", "/api/auth/signup"), ("POST", "/api/auth/onboarding/complete"), ("POST", "/api/auth/login"), ("GET", "/api/auth/me"),
        ("GET", "/api/auth/password/status"), ("POST", "/api/auth/password"), ("PATCH", "/api/profile"),
        ("POST", "/api/auth/signup/college/start"), ("POST", "/api/auth/signup/college/confirm"),
        ("GET", "/api/pools"), ("POST", "/api/pools"), ("GET", "/api/pools/mine"), ("GET", "/api/pools/matches"),
        ("PATCH", "/api/pools/{pool_id}"), ("GET", "/api/pools/{pool_id}"),
        ("POST", "/api/pools/{pool_id}/requests"), ("GET", "/api/pools/{pool_id}/requests"),
        ("GET", "/api/requests/incoming"), ("GET", "/api/requests/mine"),
        ("PATCH", "/api/requests/{request_id}/accept"), ("PATCH", "/api/requests/{request_id}/decline"), ("DELETE", "/api/requests/{request_id}"),
        ("GET", "/api/matches/confirmed"),
        ("DELETE", "/api/pools/{pool_id}/travelers/{traveler_user_id}"),
        ("POST", "/api/messages"), ("GET", "/api/messages/{other_user_id}"), ("GET", "/api/messages/conversations"),
        ("POST", "/api/messages/typing"), ("GET", "/api/messages/typing/{other_user_id}"), ("GET", "/api/users/{user_id}/presence"),
        ("POST", "/api/messages/trip/ensure/{pool_id}"), ("GET", "/api/messages/group/{conversation_id}"), ("POST", "/api/messages/group/{conversation_id}"),
        ("POST", "/api/ratings"), ("GET", "/api/ratings/user/{user_id}"), ("GET", "/api/ratings/can-rate/{user_id}"),
        ("POST", "/api/users/{user_id}/block"), ("DELETE", "/api/users/{user_id}/block"), ("GET", "/api/users/me/blocked"), ("POST", "/api/reports"),
        ("GET", "/api/locations"), ("GET", "/api/saved-routes"), ("POST", "/api/saved-routes"),
        ("GET", "/api/recurring-routes"), ("POST", "/api/recurring-routes"), ("GET", "/api/journeys/upcoming"),
        ("PATCH", "/api/journeys/{pool_id}/status"), ("PATCH", "/api/journeys/{pool_id}/meeting-point"), ("PATCH", "/api/journeys/{pool_id}/fare"),
        ("GET", "/api/route-insights"), ("GET", "/api/notifications"), ("PATCH", "/api/notifications/{notification_id}/read"),
        ("POST", "/api/notifications/read-all"), ("GET", "/api/notification-preferences"), ("PATCH", "/api/notification-preferences"),
        ("GET", "/api/pickup-points"), ("POST", "/api/pickup-points"), ("GET", "/api/travel-history"), ("GET", "/api/reliability/me"),
        ("GET", "/api/search/global"), ("POST", "/api/analytics/events"), ("POST", "/api/client-errors"), ("GET", "/api/admin/release-diagnostics"),
        ("GET", "/api/push/vapid-public-key"), ("POST", "/api/push/subscribe"), ("POST", "/api/push/unsubscribe"),
        ("POST", "/api/games/score"), ("GET", "/api/games/leaderboard/{game}"),
        ("GET", "/api/expense-dashboard"), ("GET", "/api/expense-groups"), ("POST", "/api/expense-groups"),
        ("POST", "/api/expense-groups/join"), ("GET", "/api/expense-groups/{group_id}"),
        ("POST", "/api/expense-groups/{group_id}/members"), ("POST", "/api/expense-groups/{group_id}/expenses"),
        ("DELETE", "/api/expense-groups/{group_id}/expenses/{expense_id}"), ("POST", "/api/expense-groups/{group_id}/settlements"),
        ("GET", "/api/personal-finance/dashboard"), ("GET", "/api/personal-transactions"), ("POST", "/api/personal-transactions"),
        ("PATCH", "/api/personal-transactions/{transaction_id}"), ("DELETE", "/api/personal-transactions/{transaction_id}"),
    }
    missing = sorted(required - routes)
    assert not missing, "Frontend-required API routes missing:\n" + "\n".join(f"{m} {p}" for m, p in missing)
