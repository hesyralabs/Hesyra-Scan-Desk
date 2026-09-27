# Hesyra Scan Desk — Mobile Field Scanner & Dental Order System

A dedicated, chairside order-taking and intraoral scan enrollment Web Application (PWA) built for field scanning technicians visiting dental clinics.

Every case enrolled on a phone chairside is saved in real time and can be tracked, filtered, and exported cleanly to **Excel (.xlsx)** or live-synced to a **Google Sheet**.

---

## 🚀 Key Features

### 1. Chairside Mobile Enrollment (For Field Technicians)
- **Instant Autocomplete for Dental Clinics**: Pre-cached with common clinics and doctors (e.g. Dr. Anand Bansod, Dr. Arushi Beri, Dr. Gaurav Majumdar, etc.). Quick chips fill clinic name, doctor, phone, and city in 1 tap.
- **Interactive FDI Dental Tooth Chart**:
  - Touch-friendly visual teeth diagram (Upper jaw 18-11, 21-28 | Lower jaw 48-41, 31-38).
  - Tapping teeth highlights them, updates unit count, and supports bridge pontic vs abutment designations.
- **Full Dental Material System**:
  - Zirconia Monolithic Ultra-Translucent (1200 MPa)
  - Zirconia Multi-Layer Aesthetic Anterior
  - IPS e.max CAD Lithium Disilicate
  - PFM (DMLS Laser Sintered / Cast)
  - PMMA Temporary Crowns
  - Titanium Custom Abutments + Crowns
- **Vita Classic Shade Palette**: Visual shade pills (A1-A4, B1-B4, C1-C4, D2-D4, and Bleach shades BL1-BL4), plus Stump/Prep shade (ND1-ND9).
- **Direct Chairside Camera Capture**:
  - 📸 Prep & Margin Photo
  - 🎨 Shade Guide Photo (with shade tab held next to tooth)
  - 📄 Doctor Prescription Slip Photo (captures physical handwritten Rx)
- **WhatsApp Order Confirmation**: Automatically formats a WhatsApp message with all case specs, tooth numbers, material, shade, and due date for the doctor.
- **Offline / Low-Network Resilience**: Automatically stores drafts in `localStorage` so chairside work is never lost.

---

### 2. Back-Office Order Tracker & Excel Export
- **Live Production Workflow Tracker**:
  - Stages: `Scanned & Received` ➔ `CAD Designing` ➔ `3D Milling` ➔ `Sintering & Glazing` ➔ `QC Passed` ➔ `Dispatched` ➔ `Delivered`.
  - One-click inline status updates.
- **One-Click Styled Excel (.xlsx) Export**:
  - Built with `exceljs`.
  - Royal Blue branded headers, frozen top pane, auto-column widths.
  - Formatted status pills, clickable hyperlinks to 3D scan files, and formula summaries.
  - Filterable by Date Range (Today, Yesterday, Last 7 Days, This Month, Custom), Clinic, Technician, Priority (Rush 48h / Emergency 24h), and Status.
- **Real-Time Google Sheets Auto-Sync**:
  - Automatically appends/updates rows in a connected Google Sheet every time a case is enrolled or status updated.
  - Includes a 1-minute copy-paste Google Apps Script snippet and a built-in webhook tester.
- **Printable Lab Work Ticket**:
  - Generates a clean A5/slip work ticket for milling technicians and QC inspectors.

---

## 🛠️ Quick Start

### Option A: Double-Click
Double-click `run_dev.bat` in this folder.

### Option B: Terminal
```bash
npm start
```
Then open:
- **Local Browser:** `http://localhost:3005`
- **From Phone on same Wi-Fi:** `http://<YOUR_COMPUTER_IP>:3005`
