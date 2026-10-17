"""Curated evergreen practice arenas (wargames & cryptography trainers).

These never "close", so they are emitted as `practice` records with no deadline and
are hidden by default in the dashboard (toggle "Practice Arenas").
"""

from __future__ import annotations

import logging
from typing import Dict, List

from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "curated"

PRACTICE_ARENAS: List[Dict] = [
    {
        "title": "Ethernaut",
        "platform": "OpenZeppelin",
        "url": "https://ethernaut.openzeppelin.com/",
        "category": "DeFi (General)",
        "ecosystem": "EVM",
        "languages": ["Solidity"],
        "difficulty": "Beginner",
        "tags": ["wargame", "solidity", "evm", "reentrancy", "delegatecall"],
        "description": "OpenZeppelin's Web3/Solidity wargame: hack a sequence of vulnerable contracts level by level, from fallback tricks to delegatecall storage collisions.",
    },
    {
        "title": "Damn Vulnerable DeFi",
        "platform": "Damn Vulnerable DeFi",
        "url": "https://www.damnvulnerabledefi.xyz/",
        "category": "Lending & Credit",
        "ecosystem": "EVM",
        "languages": ["Solidity"],
        "difficulty": "Advanced",
        "tags": ["wargame", "defi", "flash-loans", "oracles", "governance", "foundry"],
        "description": "Offensive-security playground for DeFi: flash loans, price oracles, governance, lending pools, DEX integrations and meta-transactions, all in Foundry.",
    },
    {
        "title": "EVM Puzzles",
        "platform": "GitHub",
        "url": "https://github.com/fvictorio/evm-puzzles",
        "category": "L1 / L2 Infrastructure",
        "ecosystem": "EVM",
        "languages": ["Solidity"],
        "difficulty": "Intermediate",
        "tags": ["evm", "opcodes", "bytecode", "puzzles"],
        "description": "Bytecode-level puzzles: supply calldata and callvalue so that each raw EVM program executes without reverting. Great for opcode fluency.",
    },
    {
        "title": "Solidity Riddles",
        "platform": "RareSkills",
        "url": "https://github.com/RareSkills/solidity-riddles",
        "category": "DeFi (General)",
        "ecosystem": "EVM",
        "languages": ["Solidity"],
        "difficulty": "Intermediate",
        "tags": ["wargame", "solidity", "ctf", "nft", "signatures"],
        "description": "RareSkills' collection of intentionally vulnerable Solidity contracts covering signature replay, read-only reentrancy, NFT and governance exploits.",
    },
    {
        "title": "Solana Security Workshop",
        "platform": "Neodyme",
        "url": "https://workshop.neodyme.io/",
        "category": "DeFi (General)",
        "ecosystem": "Solana",
        "languages": ["Rust"],
        "difficulty": "Intermediate",
        "tags": ["solana", "rust", "anchor", "account-validation"],
        "description": "Hands-on Solana program exploitation: missing signer/owner checks, account confusion, integer overflow and arbitrary CPI, with guided exercises.",
    },
    {
        "title": "Smart Contract Security Course & Practice",
        "platform": "Cyfrin Updraft",
        "url": "https://updraft.cyfrin.io/courses/security",
        "category": "DeFi (General)",
        "ecosystem": "EVM",
        "languages": ["Solidity"],
        "difficulty": "Beginner",
        "tags": ["course", "audit-methodology", "foundry", "fuzzing"],
        "description": "Free end-to-end auditing curriculum with real codebases, invariant fuzzing and report writing — a common on-ramp to CodeHawks First Flights.",
    },
    {
        "title": "CryptoHack",
        "platform": "CryptoHack",
        "url": "https://cryptohack.org/",
        "category": "ZK & Cryptography",
        "ecosystem": "Multi-chain / General",
        "languages": ["Python"],
        "difficulty": "Intermediate",
        "tags": ["cryptography", "rsa", "elliptic-curves", "aes", "lattices"],
        "description": "Gamified modern-cryptography trainer: RSA, AES, elliptic curves, lattices, hash functions and ZK puzzles with a global scoreboard.",
    },
    {
        "title": "The Cryptopals Crypto Challenges",
        "platform": "Cryptopals",
        "url": "https://cryptopals.com/",
        "category": "ZK & Cryptography",
        "ecosystem": "Multi-chain / General",
        "languages": ["Python"],
        "difficulty": "Intermediate",
        "tags": ["cryptography", "block-ciphers", "padding-oracle", "rsa"],
        "description": "Eight classic sets of real-world crypto attacks — padding oracles, CBC bit-flipping, MT19937 cloning, RSA and DSA nonce reuse.",
    },
]


def scrape() -> List[ChallengeRecord]:
    records: List[ChallengeRecord] = []
    for arena in PRACTICE_ARENAS:
        rec = build_record(
            title=arena["title"],
            platform=arena["platform"],
            source=SOURCE_NAME,
            url=arena["url"],
            challenge_type="practice",
            prize="Skill-building",
            category=arena["category"],
            ecosystem=arena["ecosystem"],
            languages=arena["languages"],
            tags=["practice", *arena["tags"]],
            description=arena["description"],
            organizer=arena["platform"],
            difficulty=arena["difficulty"],
        )
        if rec:
            records.append(rec)
    logger.info("Curated practice arenas: %d", len(records))
    return records

