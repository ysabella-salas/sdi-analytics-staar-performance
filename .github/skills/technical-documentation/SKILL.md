---
name: technical-documentation
description: Generates clear, structured Markdown documentation from code, notebooks, scripts, and data pipelines. The skill analyzes source code to identify data sources, column mappings, business transformations, validation rules, and outputs, then creates documentation that explains what the solution does, why it exists, and what data it produces. Use this skill when documenting PySpark notebooks, Microsoft Fabric pipelines, Databricks workflows, Python scripts, SQL processes, or ETL jobs. Documentation is written for developers, analysts, data scientists, and business stakeholders and focuses on business purpose, source data, transformations, validations, and outputs rather than implementation details. Suitable for README files, project wikis, technical repositories, and internal knowledge bases.
---

# Technical Documentation Skill

## Purpose

The Technical Documentation skill analyzes code, notebooks, scripts, pipelines, and data workflows and generates clear, business-friendly technical documentation in Markdown format.

The goal is to explain:

- What the code does
- What data it uses
- What transformations are applied
- What business rules are enforced
- What outputs are produced

The documentation should help developers, analysts, data engineers, data scientists, and business stakeholders understand the solution without reading the underlying code.

---

## Documentation Philosophy

Focus on documenting:

- Business purpose
- Data sources
- Transformations
- Validation logic
- Outputs

Avoid documenting:

- Every line of code
- Variable assignments
- Framework-specific implementation details
- Internal helper functions unless they impact business logic

Documentation should describe **what the code accomplishes and why**, not simply restate the code.

---

## Required Sections

Every document should contain the following sections.

### 1. Overview

Provide a concise summary of the notebook, script, or pipeline.

Include:

- Business purpose
- High-level objective
- Expected outcome

Example:

```markdown
## Overview

This notebook stages MAP Combo Student Assessment data from the landed layer into the staging layer.

The pipeline standardizes source fields, applies business transformations, validates records, and persists cleaned data for downstream consumption.
```

---

### 2. Source Data

Document all incoming data sources.

Include:

- Input tables
- Input files
- Data sources
- Source systems

Format:

```markdown
## Source Data

### Input Tables

| Source Layer | Table |
|-------------|---------|
| L01 Landed | MAP__ComboStudentAssessment |

### Description

The source data contains student assessment records from the MAP assessment platform.
```

---

### 3. Column Standardization

Document schema mapping and naming standardization.

Include:

- Renamed columns
- Data type standardization
- Schema alignment

Format:

```markdown
## Column Standardization

### Purpose

Source columns are mapped to standardized naming conventions.

### Key Mappings

| Source Column | Standardized Column |
|--------------|--------------------|
| StudentID | Student__Local__ID_Number |
| SchoolName | Enrollment__Campus__Name |
```

---

### 4. Business Transformations

Document every meaningful transformation applied to the data.

Each transformation should include:

- Transformation name
- Description
- Example (if applicable)
- Business purpose

Format:

```markdown
## Business Transformations

### Student Name Consolidation

Student first, middle, and last names are combined into a single standardized field.

#### Example

| Before | After |
|----------|----------|
| John A Smith | Smith, John A |

#### Purpose

Creates a consistent student naming convention across datasets.
```

Examples of transformations include:

- Data cleansing
- Standardization
- Parsing
- Derived fields
- Mappings
- Aggregations
- Normalization
- Conversions

---

### 5. Data Quality Validation

Document validation rules that determine data quality.

Each rule should include:

- Rule name
- Description
- Purpose

Format:

```markdown
## Data Quality Validation

### Invalid Campus Code

Records with a campus code of `000` are considered invalid.

#### Purpose

Prevents invalid campus assignments from entering downstream datasets.
```

Common validation types:

- Null checks
- Duplicate checks
- Range checks
- Cross-field validation
- Referential integrity validation
- Business rule enforcement

---

### 6. Final Output

Document the resulting dataset.

Include:

- Output tables
- Output files
- Data products
- Downstream consumers

Format:

```markdown
## Final Output

### Output Table

L02_Staged__P01_Cleaned.MAP__ComboStudentAssessment

### Output Description

The final dataset contains:

- Standardized student attributes
- Standardized enrollment attributes
- Standardized assessment attributes
- Validated records
```

---

## Documentation Style Guidelines

### Write for Mixed Audiences

Assume the reader may be:

- Data Engineer
- Data Scientist
- Analyst
- Product Owner
- Business Stakeholder

Documentation should be understandable without deep knowledge of the codebase.

---

### Describe Intent, Not Syntax

Good:

```markdown
Campus codes are extracted from the final three digits of the campus state code.
```

Bad:

```markdown
Uses substring(column, length(column)-2, 3).
```

---

### Focus on Business Meaning

Good:

```markdown
MAP administration windows are standardized to district reporting periods.
```

Bad:

```markdown
Replaces Fall with BOY.
```

---

### Include Examples When Helpful

Use before-and-after examples whenever transformations change values.

Example:

```markdown
| Source Value | Standardized Value |
|-------------|-------------------|
| BR150L | -150 |
```

---

### Avoid Code Dumps

Do not reproduce large code blocks.

Instead:

- Summarize the logic
- Explain the purpose
- Show examples when necessary

---

### Keep Documentation Concise

Document:

- Inputs
- Transformations
- Validations
- Outputs

Do not document:

- Every function call
- Temporary variables
- Logging statements
- Framework boilerplate

---

## Expected Output Format

The generated documentation must:

- Use Markdown
- Use clear section headings
- Use tables where appropriate
- Use examples when beneficial
- Follow the Required Sections order

The final deliverable should be suitable for inclusion in:

- README.md
- Technical Documentation Repository
- Data Catalog
- Project Wiki
- Internal Knowledge Base

---

## Success Criteria

A successful document allows a new team member to answer the following questions without reading the code:

1. What does this notebook or pipeline do?
2. What data does it consume?
3. What transformations occur?
4. What business rules are enforced?
5. What validations are performed?
6. What output is produced?
7. Why do these transformations exist?