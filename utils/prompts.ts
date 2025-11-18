export const specialistCuratorPrompt = `
... (This prompt is no longer used by the new architecture, but left for reference) ...
`;

export const annotatorPrompt = `
You are the "Magdalenka Annotator Agent". Your task is to analyze a given social media {POST} and generate a structured JSON annotation that strictly adheres to the provided {SCHEMA} and {CODEX}.

1.  **Analyze the {POST}:** Read the text carefully.
2.  **Analyze APO Feedback:** Review the {APO_FEEDBACK} to learn from past human corrections.
3.  **Classify Cleavages (as 'labels'):** For each of the 5 cleavages in the {CODEX}, assign a float score from 0.0 (not present) to 1.0 (explicitly present). The output JSON key for this MUST be "labels" and the array MUST have 5 elements.
4.  **Identify Tactics:** Identify all manipulative tactics present. Use the human-readable names from the {SCHEMA} (e.g., "Loaded Language").
5.  **Determine Stance & Emotion:** Identify the stance, stance target, and the single most prominent emotion fuel. Use the human-readable names from the {SCHEMA} (e.g., "Anger", "Pride").
6.  **Format Output:** Return *only* a single, valid JSON object matching the {SCHEMA}. Do not include markdown or any other text.

---
{CODEX}
---
{SCHEMA}
---
{APO_FEEDBACK}
---
{POST}
`;


export const qcAgentPrompt = `
You are the "Magdalenka QC Agent". Your task is to review a machine-generated {ANNOTATION} for a given {POST} and generate a list of specific UI suggestions for a human reviewer.

**Your Process:**
1.  **Analyze and Compare:** Carefully compare the {POST} to the {ANNOTATION}. Does the annotation accurately reflect the post's content according to the {CODEX}? Pay attention to the `labels` array (cleavages) and human-readable names for tactics/emotions.
2.  **Identify Flaws:** Identify every field in the annotation that is incorrect or could be improved.
3.  **Generate Feedback:** Write a brief, high-level summary (2-3 sentences) of your findings. If the annotation is perfect, say so. If it has flaws, summarize the most important ones.
4.  **Generate UI Suggestions:** For EACH flaw you identified, create a specific JSON object representing that correction. This is the most important step.
    *   \`field_path\`: The exact path to the field in the annotation object (e.g., "labels[1]", "tactics", "stance_target").
    *   \`control_type\`: The type of UI control for this field ('slider', 'multiselect', 'select', 'text').
    *   \`suggestion\`: The corrected value you are suggesting (e.g., a number for a slider, an array of strings for multiselect).
    *   \`rationale\`: A brief, clear explanation for *why* you are suggesting this specific change.
5.  **Determine Status:** Set 'qc_passed' to 'true' if the annotation is perfect, 'false' otherwise.

**Final Output Structure:**
Respond with *only* a single JSON object. If there are no flaws, the 'ui_suggestions' array should be empty.

\`\`\`json
{
  "qc_passed": false,
  "feedback": "The annotation correctly identified the stance but missed a key tactic and underrated the 'Trauma' cleavage.",
  "ui_suggestions": [
    {
      "field_path": "labels[4]",
      "control_type": "slider",
      "suggestion": 0.9,
      "rationale": "The post's direct mention of 'Wołyń' is a primary indicator of the 'Trauma' cleavage and should be scored higher."
    },
    {
      "field_path": "tactics",
      "control_type": "multiselect",
      "suggestion": ["Loaded Language", "Scapegoating", "Whataboutism"],
      "rationale": "The annotation missed 'Whataboutism'. The phrase 'a co z...' is a classic example of this tactic."
    }
  ]
}
\`\`\`

---
{CODEX}
---
{POST}
---
{ANNOTATION}
`;

// NEW, "BETTER AND STRONGER" PYTHON-BASED SWARM SCRIPT
export const pythonSwarmScript = `
import json
import sys
import os
import random

# The GAIS environment will provide this module if the tool is enabled
try:
    from google_search import search as google_search
except ImportError:
    print("FATAL: google_search tool not available.", file=sys.stderr)
    # Create a mock function to prevent crashes, but log the error
    def google_search(queries=None):
        print(f"MOCK SEARCH: {queries}", file=sys.stderr)
        return {"results": [{"snippet": f"Mock result for query: {q}"} for q in queries]}

# --- 1. Load Data from Placeholders ---
# These JSON strings are injected by the Node.js controller
DATASET_STATE = json.loads("""{DATASET_STATE}""")
APO_FEEDBACK = json.loads("""{APO_FEEDBACK}""")
MANUAL_QUERIES = """{MANUAL_QUERIES}"""
RAG_CONTEXT = """{RAG_CONTEXT}"""
PRECOMPUTED_TASKS = json.loads("""{PRECOMPUTED_TASKS}""")

# --- 2. Orchestrator: Dynamic Planning Phase ---

def get_underrepresented_item(data_dict, default_item):
    """Finds the key with the minimum value in a dictionary."""
    if not data_dict or all(v == 0 for v in data_dict.values()):
        return default_item
    try:
        min_key = min(data_dict, key=data_dict.get)
        return min_key
    except Exception:
        return default_item

def plan_tasks(dataset_state, apo_feedback, manual_queries, precomputed_tasks):
    """
    Creates the task list for the specialist agents.
    PRIORITY: Uses precomputed_tasks if available. Otherwise, performs dynamic gap analysis.
    """
    if precomputed_tasks:
        print("[Python Swarm] Using precomputed tasks from frontend.", file=sys.stderr)
        task_list = precomputed_tasks
        # Simple APO feedback integration for precomputed tasks
        if apo_feedback and task_list and task_list[0].get("task"):
            apo_summary = f"APO Insight: Recent human corrections show agents struggle with: {apo_feedback[0].get('qcFeedback', 'N/A')}"
            task_list[0]["task"] += f" | {apo_summary}"
        return task_list
    
    print("[Python Swarm] Planning tasks...", file=sys.stderr)
    
    # --- DYNAMIC GAP ANALYSIS (FALLBACK) ---
    cleavages = dataset_state.get('cleavages', {})
    tactics = dataset_state.get('tactics', {})
    emotions = dataset_state.get('emotions', {})

    # Find least and second-least represented items
    cleavages_sorted = sorted(cleavages.items(), key=lambda x: x[1])
    tactics_sorted = sorted(tactics.items(), key=lambda x: x[1])
    
    least_rep_cleavage = cleavages_sorted[0][0] if cleavages_sorted else 'cleavage_post_peasant'
    least_rep_tactic = tactics_sorted[0][0] if tactics_sorted else 'tactic_loaded_language'
    second_least_cleavage = cleavages_sorted[1][0] if len(cleavages_sorted) > 1 else 'cleavage_economic_anxiety'
    
    # Find most represented item for the Wildcard agent
    most_rep_cleavage = cleavages_sorted[-1][0] if cleavages_sorted else 'cleavage_sovereigntist'
    least_rep_emotion = get_underrepresented_item(emotions, 'emotion_solidarity')

    print(f"[Python Swarm] Dynamic Gap Analysis complete.", file=sys.stderr)
    print(f"[Python Swarm] Least Cleavage: {least_rep_cleavage}", file=sys.stderr)
    print(f"[Python Swarm] Least Tactic: {least_rep_tactic}", file=sys.stderr)
    # --- END DYNAMIC ANALYSIS ---
    
    # Define a consistent, dynamic task for the explorer
    explorer_task = f"Explore the intersection of the '{second_least_cleavage}' cleavage and the least-common '{least_rep_tactic}' tactic."

    if manual_queries:
        print(f"[Python Swarm] Prioritizing manual query: {manual_queries}", file=sys.stderr)
        task_list = [
            {
                "name": "Manual",
                "persona": "User Proxy",
                "task": f"Fulfill this high-priority manual query. Use RAG context if provided. Query: \\"{manual_queries}\\""
            },
            {
                "name": "Balancer",
                "persona": "Data-Gap Analyst",
                "task": f"Find examples of the least-represented cleavage: '{least_rep_cleavage}'."
            },
            {
                "name": "Explorer",
                "persona": "Creative Strategist",
                "task": explorer_task
            }
        ]
    else:
        task_list = [
            {
                "name": "Balancer",
                "persona": "Data-Gap Analyst",
                "task": f"Our dataset is low on '{least_rep_cleavage}'. Find posts that clearly exemplify this."
            },
            {
                "name": "Explorer",
                "persona": "Creative Strategist",
                "task": explorer_task
            },
            {
                "name": "Wildcard",
                "persona": "OSINT Expert",
                "task": f"The dataset is saturated with '{most_rep_cleavage}'. Find a surprising or nuanced post about this topic that also evokes the underrepresented emotion of '{least_rep_emotion}'."
            }
        ]
    
    # Simple APO feedback integration
    if apo_feedback:
        apo_summary = f"APO Insight: Recent human corrections show agents struggle with: {apo_feedback[0].get('qcFeedback', 'N/A')}"
        if task_list[0].get("task"):
             task_list[0]["task"] += f" | {apo_summary}"
        
    print(f"[Python Swarm] Planning complete. {len(task_list)} tasks created.", file=sys.stderr)
    return task_list

# --- 3. Specialist Agent Logic ---
KEYWORD_MAP = {
    'cleavage_post_peasant': ['"polska prowincjonalna"', '"elity kontra lud"', '"warszawka"', '"oderwani od rzeczywistości"'],
    'cleavage_economic_anxiety': ['"drożyzna"', '"koszty życia"', '"kryzys gospodarczy"', '"Zielony Ład"'],
    'cleavage_sovereigntist': ['"suwerenność"', '"dyktat Brukseli"', '"niemiecka dominacja"', '"interesy Polski"'],
    'cleavage_generational': ['"dziadersi"', '"młode pokolenie"', '"zmiana pokoleniowa"', '"partyjny beton"'],
    'cleavage_trauma': ['"historia Polski"', '"pamięć historyczna"', '"Smoleńsk"', '"Wołyń"', '"reparacje"'],
    'tactic_whataboutism': ['"a co z..."', '"a za PO..."', '"a PiS..."'],
    'tactic_scapegoating': ['"wina Tuska"', '"przez imigrantów"', '"obcy agenci"']
}

def get_search_sites():
    """Returns a list of sites for searching."""
    return [
        "site:wykop.pl", "site:twitter.com", "site:forum.gazeta.pl", "site:wpolityce.pl",
        "site:dorzeczy.pl", "site:oko.press", "site:krytykapolityczna.pl", "site:onet.pl", "site:wp.pl"
    ]

def generate_queries_for_task(persona, task):
    """Generates more intelligent queries based on task and persona."""
    # Extract entities from task, e.g., 'cleavage_post_peasant'
    entities = [word.strip("'.,") for word in task.split() if 'cleavage_' in word or 'tactic_' in word]
    
    # Use keyword map for better search terms
    keywords = [random.choice(KEYWORD_MAP.get(e, [e.split('_')[-1]])) for e in entities]
    
    if not keywords:
        keywords = [task.split(':')[-1].strip()]

    # Select random sites to diversify sources
    sites = random.sample(get_search_sites(), 2)
    
    # Persona-driven query construction
    if persona == 'Explorer' and len(keywords) > 1:
        # Explorer looks for intersections
        return [f'"{keywords[0]}" AND "{keywords[1]}" {site}' for site in sites]
    else: # Balancer, Wildcard, Manual focus on one primary concept
        return [f'"{keywords[0]}" {site}' for site in sites] + [f'"{keywords[0]}" (polityka OR opinie)']


def run_specialist_agent(agent_name, persona, task, rag_context):
    """
    Runs a specialist agent with smarter query generation.
    """
    print(f"[Python Swarm: {agent_name}] Agent activated. Task: {task}", file=sys.stderr)
    
    queries = generate_queries_for_task(persona, task)
    
    if rag_context:
         print(f"[Python Swarm: {agent_name}] Using RAG context.", file=sys.stderr)
         queries.append(f"{rag_context} {task}")

    try:
        search_results = google_search(queries=queries[:3]) # Limit to 3 queries per agent
        results = search_results.get("results", [])
        contributed_posts = [res.get('snippet', '') for res in results if res.get('snippet') and len(res.get('snippet', '')) > 100]
        
        if not contributed_posts:
             contributed_posts = [
                f"Placeholder post from {agent_name}: Found example of '{task[:40]}...'",
                f"Placeholder post from {agent_name}: Another example of '{task[:40]}...'"
             ]

        print(f"[Python Swarm: {agent_name}] Agent complete. Found {len(contributed_posts)} posts.", file=sys.stderr)
        
        return {
            "agentName": agent_name,
            "contributedPosts": contributed_posts,
            "executedQueries": ", ".join(queries),
            "log": f"Agent executed {len(queries)} queries and found {len(contributed_posts)} potential posts."
        }
    except Exception as e:
        print(f"[Python Swarm: {agent_name}] Agent FAILED: {e}", file=sys.stderr)
        return {
            "agentName": agent_name,
            "contributedPosts": [],
            "executedQueries": ", ".join(queries),
            "log": f"Agent failed to execute: {e}"
        }

# --- 4. Orchestrator: Synthesis Phase ---
def synthesize_results(agent_reports):
    """
    Aggregates, deduplicates, and selects the final post batch.
    """
    print(f"[Python Swarm] Synthesizing results from {len(agent_reports)} agents...", file=sys.stderr)
    all_posts = []
    for report in agent_reports:
        all_posts.extend(report["contributedPosts"])
    
    seen = set()
    unique_posts = []
    for post in all_posts:
        if post.lower() not in seen:
            unique_posts.append(post)
            seen.add(post.lower())
            
    final_batch = unique_posts[:10]
    
    trigger_suggestions = [
        f"Queries for '{report['agentName']}' were successful: {report['executedQueries']}"
        for report in agent_reports if report["contributedPosts"]
    ]
    
    final_result = {
        "finalPosts": final_batch,
        "triggerSuggestions": trigger_suggestions,
        "agentReports": agent_reports
    }
    
    print(f"[Python Swarm] Synthesis complete. Final batch size: {len(final_batch)}", file=sys.stderr)
    return final_result

# --- 5. Main Execution ---
def main():
    try:
        tasks = plan_tasks(DATASET_STATE, APO_FEEDBACK, MANUAL_QUERIES, PRECOMPUTED_TASKS)
        agent_reports = [run_specialist_agent(t["name"], t["persona"], t["task"], RAG_CONTEXT) for t in tasks]
        final_result = synthesize_results(agent_reports)
        print(json.dumps(final_result))
        
    except Exception as e:
        print(f"FATAL SCRIPT ERROR: {e}", file=sys.stderr)
        print(json.dumps({"error": "Python swarm script failed", "details": str(e)}))

if __name__ == "__main__":
    main()
`;

// NEW: Updated Program-of-Thought prompts for the Annotator agent
export const annotatorPoTPlannerPrompt = `
You are a meticulous "Planner Agent" for a data annotation task.
Your goal is to create a step-by-step reasoning plan for an "Annotator Agent" to follow. The plan should guide the agent to accurately analyze a social media {POST} according to the provided {CODEX_SUMMARY}.

The plan must be a concise, logical sequence of analysis steps. It should not perform the analysis itself.

**Example Plan Format:**
1.  Initial Read: Identify the main topic and overall tone of the post.
2.  Stance Analysis: Determine the author's stance (For, Against, Neutral) towards the main topic. Identify the specific target of this stance.
3.  Emotional Core: Pinpoint the primary emotion the post is trying to evoke, referencing the codex emotion list (e.g., "Moral Outrage", "Grief").
4.  Cleavage Detection: Systematically check for the presence of each of the 5 cleavages, noting keywords or phrases that indicate their presence.
5.  Tactic Identification: Scan the post for specific manipulative tactics listed in the codex (e.g., "Scapegoating", "Whataboutism"), explaining why each identified tactic applies.

**Your Task:**
Create a similar reasoning plan to analyze the following post.

---
**CODEX SUMMARY (Labels Available):**
{CODEX_SUMMARY}
---
**POST:**
"{POST}"
---

**Reasoning Plan:**
`;

export const annotatorPoTWorkerCleavagePrompt = `
You are a specialist "Cleavage Analysis Agent".
Your task is to follow the {ANALYSIS_PLAN} and analyze the {POST} to determine the activation scores for the 5 core cleavages defined in the {CODEX}.

**Instructions:**
1.  Focus ONLY on the cleavage analysis part of the plan.
2.  For each of the 5 cleavages, assign a float score from 0.0 to 1.0.
3.  Your output MUST be a single, valid JSON object containing ONLY the "labels" key. The value must be an array of exactly 5 float numbers, in the correct order as defined by the codex.

**Example Output:**
{
  "labels": [0.1, 0.8, 0.0, 0.2, 0.9]
}

---
**CODEX (for reference):**
{CODEX}
---
**ANALYSIS PLAN:**
{ANALYSIS_PLAN}
---
**POST:**
"{POST}"
---
`;

export const annotatorPoTWorkerTacticPrompt = `
You are a specialist "Tactic Identification Agent".
Your task is to follow the {ANALYSIS_PLAN} and analyze the {POST} to identify all manipulative tactics used, as defined in the {CODEX}.

**Instructions:**
1.  Focus ONLY on the tactic identification part of the plan.
2.  Identify all tactics present. Use the human-readable names (e.g., "Loaded Language", "Scapegoating").
3.  Your output MUST be a single, valid JSON object containing ONLY the "tactics" key. The value must be an array of strings. If no tactics are present, return an empty array.

**Example Output:**
{
  "tactics": ["Scapegoating", "Appeal to Fear"]
}

---
**CODEX (for reference):**
{CODEX}
---
**ANALYSIS PLAN:**
{ANALYSIS_PLAN}
---
**POST:**
"{POST}"
---
`;

export const annotatorPoTWorkerStancePrompt = `
You are a specialist "Stance and Emotion Agent".
Your task is to follow the {ANALYSIS_PLAN} and analyze the {POST} to determine its stance, stance target, and emotional fuel, as defined in the {CODEX}.

**Instructions:**
1.  Focus ONLY on the stance and emotion analysis part of the plan.
2.  Determine the stance label ('AGAINST', 'FOR', 'NEUTRAL').
3.  Identify the specific entity, idea, or group that is the target of the stance.
4.  Identify the single most prominent emotion using its human-readable name (e.g., "Anger", "Grief"). Use 'Apathy' for neutral or unemotional posts.
5.  Your output MUST be a single, valid JSON object containing ONLY the "stance_label", "stance_target", and "emotion_fuel" keys.

**Example Output:**
{
  "stance_label": "AGAINST",
  "stance_target": "EU Green Deal",
  "emotion_fuel": "Anger"
}

---
**CODEX (for reference):**
{CODEX}
---
**ANALYSIS PLAN:**
{ANALYSIS_PLAN}
---
**POST:**
"{POST}"
---
`;

export const annotatorPoTCriticPrompt = `
You are the final "Annotation Critic Agent". Your task is to review a {COMBINED_ANNOTATION} generated by a team of specialist agents for a given {POST}. You must critique it, correct any errors, and ensure it strictly conforms to the provided {SCHEMA}. You also have {APO_FEEDBACK} from previous human corrections to learn from.

**Your Process:**
1.  **Review the Post:** Read the {POST} carefully.
2.  **Review the Combined Annotation:** Examine the {COMBINED_ANNOTATION}. Does it accurately reflect the post?
3.  **Cross-Reference the Schema:** Ensure every field in the annotation exists in the {SCHEMA}, has the correct data type (e.g., 'labels' is an array of 5 floats, 'tactics' is an array of human-readable strings like "Loaded Language"), and uses valid enum values.
4.  **Incorporate APO Feedback:** Review the {APO_FEEDBACK}. If it contains relevant information, apply the learnings.
5.  **Correct and Finalize:** Make any necessary corrections to the annotation. Fix incorrect scores, add/remove tactics, and adjust stance or emotion.
6.  **Final Output:** Return a single, valid, and corrected JSON object that perfectly matches the {SCHEMA}. Do not include any other text, reasoning, or markdown.

---
**SCHEMA (Your output MUST conform to this):**
{SCHEMA}
---
**APO FEEDBACK (Learn from past corrections):**
{APO_FEEDBACK}
---
**POST:**
"{POST}"
---
**COMBINED ANNOTATION (Review and correct this):**
{COMBINED_ANNOTATION}
---
`;

export const pythonAnalysisScript = `
import json
import sys
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import io
import base64

# --- Tactic List (from Magdalenka Codex Classification.json) ---
# This ensures a consistent order for the heatmap axes.
ALL_TACTICS = [
    "Loaded Language", "Dog Whistling", "Scapegoating", "Appeal to Fear", 
    "Appeal to Pride/Patriotism", "Appeal to Authority", "Gaslighting", "Straw Man / Misrepresentation", 
    "Ad Hominem / Personal Attack", "False Dichotomy", "Whataboutism", "Astroturfing / Coordinated Inauthenticity",
    "Firehose of Falsehood / Gish Gallop", "Algorithmic Gaming", "Narrative Hijacking / Concept Hijacking",
    "Moralization / Sanctimony"
]

# --- Main Analysis Logic ---
try:
    # This JSON string is injected by the Node.js controller
    json_data = """{JSON_PLACEHOLDER}"""
    
    # 1. Load data into a pandas DataFrame
    feedback_log = json.loads(json_data)
    if not feedback_log:
        raise ValueError("Input feedback log is empty.")
        
    df = pd.DataFrame(feedback_log)
    
    # 2. Initialize the confusion matrix (tactic agreement matrix)
    num_tactics = len(ALL_TACTICS)
    agreement_matrix = pd.DataFrame(0, index=ALL_TACTICS, columns=ALL_TACTICS)

    # 3. Create a simpler summary for visualization: Agreement, Additions, Removals
    summary_data = {
        'Tactic': ALL_TACTICS,
        'Agreement (Kept)': [0] * num_tactics,
        'Corrections (Added)': [0] * num_tactics,
        'Corrections (Removed)': [0] * num_tactics,
    }
    
    for index, row in df.iterrows():
        original_tactics = set(row['originalAnnotation'].get('tactics', []))
        corrected_tactics = set(row['correctedAnnotation'].get('tactics', []))
        
        for i, tactic in enumerate(ALL_TACTICS):
            # Was it kept?
            if tactic in original_tactics and tactic in corrected_tactics:
                 summary_data['Agreement (Kept)'][i] += 1
            # Was it added by the user?
            elif tactic in corrected_tactics and tactic not in original_tactics:
                summary_data['Corrections (Added)'][i] += 1
            # Was it removed by the user?
            elif tactic in original_tactics and tactic not in corrected_tactics:
                summary_data['Corrections (Removed)'][i] += 1

    summary_df = pd.DataFrame(summary_data).set_index('Tactic')
    # Filter out tactics that were never seen
    summary_df = summary_df.loc[(summary_df.sum(axis=1) > 0)]

    if summary_df.empty:
        raise ValueError("No tactic changes found in the feedback log to analyze.")

    # 5. Create the plot
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(10, max(8, len(summary_df) * 0.5)))
    
    sns.heatmap(
        summary_df,
        annot=True,
        fmt="d",
        cmap=sns.diverging_palette(250, 15, s=75, l=40, n=9, center="dark"),
        linewidths=.5,
        ax=ax,
        cbar=False
    )
    
    ax.set_title('Tactic Annotation Agreement & Correction Report', fontsize=16, pad=20, color='white')
    ax.set_ylabel('Manipulative Tactic', fontsize=12, color='white')
    ax.set_xlabel('Outcome after Human Review', fontsize=12, color='white')
    plt.xticks(rotation=0, ha='center', color='white')
    plt.yticks(rotation=0, color='white')
    plt.tight_layout()

    # 6. Save plot to a memory buffer and encode as base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=120, transparent=True)
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()

    # 7. Print the base64 string to stdout
    print(img_base64)

except Exception as e:
    # If the script fails, print the error message to stderr
    print(f"ERROR: {e}", file=sys.stderr)
`;
