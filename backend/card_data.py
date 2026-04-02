import random

CHANCE_CARDS = [
    {
        "deck": "Chance",
        "title": "Advance to Start",
        "description": "Move to Start and collect $200.",
        "effect_type": "move_to",
        "position": 0,
        "collect_start": True,
    },
    {
        "deck": "Chance",
        "title": "Lucky break",
        "description": "Collect $100 from the bank.",
        "effect_type": "cash",
        "amount": 100,
    },
    {
        "deck": "Chance",
        "title": "Repair bill",
        "description": "Pay $100 for emergency repairs.",
        "effect_type": "cash",
        "amount": -100,
    },
    {
        "deck": "Chance",
        "title": "Express line",
        "description": "Advance to North Line.",
        "effect_type": "move_to",
        "position": 5,
    },
    {
        "deck": "Chance",
        "title": "Go to Jail",
        "description": "Move directly to Jail.",
        "effect_type": "go_to_jail",
    },
]

COMMUNITY_CARDS = [
    {
        "deck": "Community",
        "title": "Bank error in your favor",
        "description": "Collect $200.",
        "effect_type": "cash",
        "amount": 200,
    },
    {
        "deck": "Community",
        "title": "Doctor's fee",
        "description": "Pay $50.",
        "effect_type": "cash",
        "amount": -50,
    },
    {
        "deck": "Community",
        "title": "Advance to Start",
        "description": "Move to Start and collect $200.",
        "effect_type": "move_to",
        "position": 0,
        "collect_start": True,
    },
    {
        "deck": "Community",
        "title": "Downtown transfer",
        "description": "Advance to Amber Alley.",
        "effect_type": "move_to",
        "position": 11,
    },
    {
        "deck": "Community",
        "title": "Go to Jail",
        "description": "Move directly to Jail.",
        "effect_type": "go_to_jail",
    },
]


def draw_card(cell_type: str) -> dict:
    if cell_type == "chance":
        return random.choice(CHANCE_CARDS).copy()

    if cell_type == "community":
        return random.choice(COMMUNITY_CARDS).copy()

    raise ValueError(f"Unsupported card deck: {cell_type}")
