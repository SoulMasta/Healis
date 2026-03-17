1. Interface Changes

Based on the screenshot, make the following adjustments:

Remove the "Library" item located inside the "Groups" section in the left sidebar.

Keep only one main Library entry in the main navigation.

When the user clicks Library, the page shown in the screenshot should open.

2. Core Concept of the Library

The library is a centralized catalog of educational materials, organized using the following structure:

University
   → Faculty
       → Course
           → Subject
               → Material Type
                   → Board
                       → Content
3. Subject Storage

The list of subjects must be stored on the server, not on the client.

Subjects must be associated with:

faculty
course

Example structure:

{
  "faculty": "General Medicine",
  "course": 2,
  "subjects": [
    Патологическая анатомия
    Патофизиология
    Микробиология
    Топографическая анатомия и оперативная хирургия
    Гигиена
    Сестринское дело
    Прикладная физическая культура и спорт
    Практика по получению первичных навыков научно-исследовательской работы
    Практика по получению профессиональных умений и опыта профессиональной деятельности "Сестринская"
    Организация предпринимательской деятельности
    Философия
    Иностранный язык для профессионального общения 
  ]
}

Save the subject list provided by the user.

4. Retrieving Subjects for a User

When a user opens the library:

Retrieve from the user profile:

faculty
course

Send a request:

GET /library/subjects?faculty=X&course=Y

The server returns the list of subjects.

5. Library UX

The user flow should work as follows.

Step 1

The user clicks Library.

The library page opens.

Step 2

The main screen displays a list of subjects.

Each subject is displayed as a card:

Biochemistry
12 boards

Pharmacology
8 boards

Each subject card must contain:

subject name
number of boards
open button
6. Subject Page

When a subject is opened, the user enters the Subject Page.

Do not display boards in a single flat list.

Materials must be divided into categories.

Structure:

Biochemistry

Notes
Exams
Flashcards
Tables
Practice

Each category displays:

category name
number of boards
7. Category Page

When a category is opened, the user sees the boards inside that category.

Example:

Notes

Carbohydrate Metabolism
Krebs Cycle
Lipid Biosynthesis

Each board should display:

title
author
creation date
number of participants
rating
8. Popular Materials

The main library page must include a section:

Popular on your course

Example:

Carbohydrate Metabolism
58 students

Drug Table
43 students

Sorting should be based on:

views
members
likes
9. Filters

Add filters:

Popular
New

Logic:

Popular:

sort by views or participants

New:

sort by created_at
10. Search

Search must work across:

subjects
categories
boards

Example:

Search query: glycolysis

Results:

Biochemistry
 └ Note: Glycolysis

Pharmacology
 └ Table: Glycolysis inhibitors
11. Creating a Board

The Create Board button should open a creation form.

Fields:

Board title
Subject
Category
Description (optional)
12. UX When No Boards Exist

If a category contains no boards, display:

No materials exist for this subject yet.
Create the first board.
13. Database Architecture
users
id
name
faculty
course
subjects
id
name
faculty
course
subject_categories
id
subject_id
name

Example categories:

Notes
Exams
Flashcards
Tables
Practice
boards
id
title
subject_id
category_id
author_id
created_at
views
likes
board_members
user_id
board_id
14. API
Get subjects
GET /library/subjects
Get subject categories
GET /library/subjects/:id/categories
Get boards
GET /library/boards?subject=X&category=Y
Popular boards
GET /library/popular
15. Mobile Version

On mobile, subjects should be displayed as cards.

Example:

[Biochemistry]
12 materials

[Pharmacology]
8 materials

When opened:

Notes
Exams
Flashcards
16. Social Features

Each board should display:

author
number of participants
likes
views

Also include a link:

View all materials by this author

This allows students to:

compete for creating the best materials
17. Scalability

The architecture must allow:

adding new faculties
adding new courses
adding new universities
18. Performance

Add:

pagination
caching
database indexes
19. Important Requirement

The implementation must:

use the existing UI
not break the current architecture
be scalable
Core Goal of the Library

The system should function like:

Notion + Reddit + a university knowledge base

Where students:

create materials
rate them
use the best resources
