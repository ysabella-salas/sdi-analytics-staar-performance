## Example Documentation

# MAP Combo Student Assessment Staging Pipeline

## Overview

This notebook stages MAP Combo Student Assessment data from the landed layer into the staging layer.

The pipeline standardizes source fields, applies business transformations, validates records, and persists cleaned data for downstream consumption.

---

## Source Data

### Input Tables

| Source Layer | Table |
|-------------|---------|
| L01 Landed | MAP__ComboStudentAssessment |

### Description

The source data contains student assessment records from the MAP assessment platform. Data is ingested from the landed layer and transformed into a standardized schema used throughout the Student Data Architecture.

---

## Column Standardization

### Purpose

Source columns are mapped to standardized naming conventions to ensure consistency across assessment datasets and support downstream integrations.

### Key Mappings

| Source Column | Standardized Column |
|--------------|--------------------|
| StudentID | Student__Local__ID_Number |
| Student_StateID | Student__State__ID_Number |
| StudentFirstName | Student__First__Name |
| StudentLastName | Student__Last__Name |
| School_StateID | Enrollment__Campus__State__Code |
| SchoolName | Enrollment__Campus__Name |

### Standardization Activities

- Column renaming
- Data type conversion
- Schema alignment
- Standardized naming conventions

---

## Business Transformations

### Student Name Consolidation

Student first, middle, and last names are combined into a single standardized field.

#### Example

| Before | After |
|----------|----------|
| John A Smith | Smith, John A |

---

### Campus Code Extraction

The final three digits of the campus state code are extracted and stored as the campus code.

#### Example

| Campus State Code | Campus Code |
|------------------|--------------|
| 101912345 | 345 |

#### Purpose

- Creates a district campus identifier
- Supports joins with campus dimension tables
- Improves consistency across datasets

---

### Campus ID Creation

Campus codes are converted to integer values for reporting and integration purposes.

---

### Campus Name Cleanup

Campus identifiers appended to campus names are removed.

#### Example

| Before | After |
|---------|---------|
| North High School (123) | North High School |

#### Purpose

- Improves readability
- Standardizes campus naming conventions

---

### School Year Extraction

School year values are derived from assessment administration information.

#### Example

| Source Value | School Year |
|-------------|-------------|
| Fall-2025 | 2025 |

---

### Administration Term Standardization

MAP administration windows are mapped to district-standard administration terms.

| Source Value | Standardized Value |
|-------------|-------------------|
| Fall | BOY |
| Winter | MOY |
| Spring | EOY |

#### Purpose

- Aligns MAP terminology with district reporting standards
- Enables cross-assessment comparisons

---

### Time Formatting

Assessment start times are standardized using the following format:

```text
HH:mm:ss
```

#### Example

```text
08:15:00
```

---

### National Norm Cleanup

Special values are converted into valid numeric year values.

#### Example

| Source Value | Standardized Value |
|-------------|-------------------|
| USER | 2025 |

---

### Lexile Score Transformation

Lexile scores beginning with `BR` are converted to negative numeric values.

#### Example

| Source Value | Standardized Value |
|-------------|-------------------|
| BR150L | -150 |
| 850L | 850 |

#### Purpose

Supports numeric calculations, aggregations, and reporting.

---

### Quantile Score Transformation

Quantile scores beginning with `EM` are converted to negative numeric values.

#### Example

| Source Value | Standardized Value |
|-------------|-------------------|
| EM300Q | -300 |
| 750Q | 750 |

#### Purpose

Supports numeric calculations, aggregations, and reporting.

---

### Growth Indicator Standardization

Projected growth indicators are standardized to ensure consistency.

#### Example

| Source Value | Standardized Value |
|-------------|-------------------|
| Yes | TRUE |
| No | FALSE |

#### Purpose

Enables consistent reporting and analysis of projected growth metrics.

---

## Data Quality Validation

### Validation Rules

#### Invalid Campus Code

Records with a campus code of `000` are considered invalid.

#### Purpose

Prevents records with invalid campus assignments from entering downstream datasets.

---

#### Grade Level Mismatch

Records where the enrollment grade level differs from the assessment grade level are considered invalid.

#### Purpose

Ensures assessment results are aligned with student enrollment records.

---

### Validation Objective

These validation rules ensure that only accurate and reportable records are included in downstream datasets and reporting processes.

---

## Final Output

### Output Table

```text
L02_Staged__P01_Cleaned.MAP__ComboStudentAssessment
```

### Output Description

The final dataset contains:

- Standardized student attributes
- Standardized enrollment attributes
- Standardized assessment attributes
- Cleansed and validated records
- Data ready for downstream reporting and analytics