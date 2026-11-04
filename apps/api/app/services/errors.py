"""Plain errors that services raise; main.py turns them into 404 / 409 / 422 responses."""


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


class Invalid(Exception):
    pass
