# Web Application Mimicking Google Sheets

## Objective

Develop a web application that closely mimics the user interface and core functionalities of Google Sheets, with a focus on mathematical and data quality functions, data entry, and key UI interactions.

## Features

### 1. Spreadsheet Interface

- Mimic Google Sheets UI: Strive for a visual design and layout that closely resembles Google Sheets, including the toolbar, formula bar, and cell structure.
- Drag Functions: Implement drag functionality for cell content, formulas, and selections to mirror Google Sheets' behavior.
- Cell Dependencies: Ensure that formulas and functions accurately reflect cell dependencies and update accordingly when changes are made to related cells.
- Support for basic cell formatting (bold, italics, font size, color).
- Ability to add, delete, and resize rows and columns.

### 2. Mathematical Functions

- Implement the following mathematical functions:
  1. **SUM**: Calculates the sum of a range of cells.
  2. **AVERAGE**: Calculates the average of a range of cells.
  3. **MAX**: Returns the maximum value from a range of cells.
  4. **MIN**: Returns the minimum value from a range of cells.
  5. **COUNT**: Counts the number of cells containing numerical values in a range.

### 3. Data Quality Functions

- Implement the following data quality functions:
  1. **TRIM**: Removes leading and trailing whitespace from a cell.
  2. **UPPER**: Converts the text in a cell to uppercase.
  3. **LOWER**: Converts the text in a cell to lowercase.
  4. **REMOVE\_DUPLICATES**: Removes duplicate rows from a selected range.
  5. **FIND\_AND\_REPLACE**: Allows users to find and replace specific text within a range of cells.

### 4. Data Entry and Validation

- Allow users to input various data types (numbers, text, dates).
- Implement basic data validation checks (e.g., ensuring numeric cells only contain numbers).

### 5. Testing

- Provide a means for users to test the implemented functions with their own data.
- Display the results of function execution clearly.

### Bonus Features

- Implement additional mathematical and data quality functions.
- Add support for more complex formulas and cell referencing (e.g., relative and absolute references).
- Allow users to save and load their spreadsheets.
- Incorporate data visualization capabilities (e.g., charts, graphs).

## Evaluation Criteria

- **Fidelity to Google Sheets UI**: How closely the application's look and feel matches Google Sheets, including drag functions and cell dependency handling.
- **Functionality and completeness** of the implemented features.
- **Accuracy** of the mathematical and data quality functions.
- **Usability and intuitiveness** of the user interface.
- **Code quality and maintainability**.
- **Implementation of bonus features**.
- **README clarity**: Explanation of data structures and tech stack used.

## Tech Stack

- **Frontend**: React.js for dynamic UI and state management.
- **State Management**: Context API / Redux (if needed for complex state handling).
- **Styling**: Tailwind CSS / Bootstrap for responsive and aesthetic design.
- **Charting Library**: React Chart.js for data visualization and graph plotting.

## Installation & Setup

1. Clone the repository:

   ```sh
   git clone https://github.com/yourusername/your-repo.git
   cd your-repo
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Install React Chart.js dependencies:

   ```sh
   npm install react-chartjs-2 chart.js
   ```

4. Start the development server:

   ```sh
   npm start
   ```

## Dependencies

- **React.js**: Core framework for building UI components.
- **react-chartjs-2**: React wrapper for Chart.js, used for data visualization.
- **chart.js**: Library for rendering charts and graphs.
- **Tailwind CSS / Bootstrap**: For responsive and modern UI design.
- **React Router**: For navigation within the application.

## License

This project is licensed under the MIT License.

##

