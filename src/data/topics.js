// src/data/topics.js
const topics = {
  "A1 - Starter / Elementary": [
    { id: 1, title: "Alphabet (алфавит)" },
    { id: 2, title: "Pronouns (I, You, He, She...)" },
    { id: 3, title: "Verb To Be (am, is, are)" },
    { id: 4, title: "Articles (a, an, the)" },
    { id: 5, title: "Singular & Plural Nouns" },
    { id: 6, title: "Possessive Adjectives" },
    { id: 7, title: "Demonstratives (this/that)" },
    { id: 8, title: "There is / There are" },
    { id: 9, title: "Have / Has Got" },
    { id: 10, title: "Countable & Uncountable" },
    { id: 11, title: "Some / Any" },
    { id: 12, title: "Much / Many / A lot of" }
  ],
  "A2 - Pre-Intermediate": [
    { id: 13, title: "Prepositions of Place: In/On/At" },
    { id: 14, title: "Advanced Place Prepositions" },
    { id: 15, title: "Prepositions of Time" },
    { id: 16, title: "Prepositions of Movement" },
    { id: 17, title: "Since / For" },
    { id: 18, title: "During / While / By / Until" },
    { id: 19, title: "Question Words: What/Where/When" },
    { id: 20, title: "Question Words: Why/Who/Whose" },
    { id: 21, title: "Question Words: Which/How" },
    { id: 22, title: "How much / How many" },
    { id: 23, title: "How often / How long" }
  ],
  "B1 - Intermediate": [
    { id: 24, title: "Present Simple (Positive)" },
    { id: 25, title: "Present Simple (Negative/?/Short)" },
    { id: 26, title: "Present Continuous (Positive)" },
    { id: 27, title: "Present Continuous (Neg/?)" },
    { id: 28, title: "Present Simple vs Continuous" },
    { id: 29, title: "Present Perfect (Positive)" },
    { id: 30, title: "Present Perfect (Neg/?)" },
    { id: 31, title: "Present Perfect Continuous" },
    { id: 32, title: "Present Perfect vs Continuous" },
    { id: 33, title: "Past Simple (Regular/Irregular)" },
    { id: 34, title: "Past Simple (Neg/?)" },
    { id: 35, title: "Past Continuous" },
    { id: 36, title: "Past Simple vs Past Continuous" }
  ],
  "B2 - Upper-Intermediate": [
    { id: 37, title: "Past Perfect" },
    { id: 38, title: "Past Perfect Continuous" },
    { id: 39, title: "Future Simple (will)" },
    { id: 40, title: "Future Continuous" },
    { id: 41, title: "Future Perfect" },
    { id: 42, title: "Future Perfect Continuous" },
    { id: 43, title: "Future Forms: Going To" },
    { id: 44, title: "Will vs Going To" },
    { id: 45, title: "Present Continuous for Future" },
    { id: 46, title: "Future Plans & Predictions" },
    { id: 47, title: "Modal Verbs: Can / Could" },
    { id: 48, title: "Modal Verbs: May / Might" },
    { id: 49, title: "Modal Verbs: Must / Have To" },
    { id: 50, title: "Modal Verbs: Should / Ought To" },
    { id: 51, title: "Modal Verbs: Will / Would" },
    { id: 52, title: "Modal Verbs: Shall" },
    { id: 53, title: "Comparative Adjectives" },
    { id: 54, title: "Superlative Adjectives" },
    { id: 55, title: "Comparisons: As...As/Too/Enough" }
  ],
  "C1 - Advanced": [
    { id: 56, title: "Zero Conditional" },
    { id: 57, title: "First Conditional" },
    { id: 58, title: "Second Conditional" },
    { id: 59, title: "Third Conditional" },
    { id: 60, title: "Mixed Conditionals" },
    { id: 61, title: "Present Passive Voice" },
    { id: 62, title: "Past Passive Voice" },
    { id: 63, title: "Future Passive Voice" },
    { id: 64, title: "Perfect Passive Voice" },
    { id: 65, title: "Advanced Passive Structures" },
    { id: 66, title: "Reported Statements" },
    { id: 67, title: "Reported Questions" },
    { id: 68, title: "Reported Commands & Requests" },
    { id: 69, title: "Gerunds: Verb + Ing" },
    { id: 70, title: "Infinitives: Verb + To" },
    { id: 71, title: "Gerunds vs Infinitives" },
    { id: 72, title: "Meaning Change: Stop doing/to do" }
  ],
  "C2 - Proficiency": [
    { id: 73, title: "Relative Clauses: Who/Which/That" },
    { id: 74, title: "Relative Clauses: Whose/Where" },
    { id: 75, title: "Linking Words: Basic" },
    { id: 76, title: "Linking Words: Advanced" },
    { id: 77, title: "Linking Words: Professional" },
    { id: 78, title: "Phrasal Verbs: Daily" },
    { id: 79, title: "Phrasal Verbs: Discovery" },
    { id: 80, title: "Phrasal Verbs: Electronics" },
    { id: 81, title: "Phrasal Verbs: Decisions" },
    { id: 82, title: "Phrasal Verbs: Movement" },
    { id: 83, title: "Advanced: Used To / Would" },
    { id: 84, title: "Advanced: Be/Get Used To" },
    { id: 85, title: "Advanced: Question Tags" },
    { id: 86, title: "Advanced: Causative Have/Get" },
    { id: 87, title: "Advanced: Inversion structures" },
    { id: 88, title: "Advanced: Participle Clauses" },
    { id: 89, title: "Advanced: Cleft Sentences" },
    { id: 90, title: "Advanced: Nominalisation & Ellipsis" },
    { id: 91, title: "Advanced: C2 Discourse Markers" }
  ]
};

// Экспортируем сам объект с темами
module.exports = topics;

// Экспортируем функцию быстрого поиска темы по ID (нужно для Крона)
module.exports.getTopicById = (id) => {
  for (const level in topics) {
    const found = topics[level].find(t => t.id === id);
    if (found) return found.title;
  }
  return "Свободная разговорная практика (Уровень C2)";
};