# Hard Cases for ASR: Custom Speech Model Report

## 1. Introduction

Automatic Speech Recognition (ASR) systems often struggle with certain words, names, and accents. The goal of this experiment was to enhance ASR performance on "hard cases" by training a custom speech model using Azure Custom Speech. The dataset focused on challenging words, including fictional names, scientific terms, and accented pronunciations. By training a model on these cases, I aimed to improve transcription accuracy and analyze the impact of custom training.

## 2. Methodology

### 2.1 Data Preparation

- Audio Collection:
    - Sourced from the Common Voice Project by Mozilla, which provides certified speech data.
- Reason for Using Certified Speech Data:
    - Rather than manually recording, I opted for pre-existing, verified speech samples to ensure data quality, speaker diversity, and a broad range of topics that could enhance ASR performance on hard cases.
- Dataset Size:
    - A small subset of 25 utterances was used for testing.
- Transcription Formatting:
    - Each audio file was paired with a transcript, formatted as `.wav`  and `.txt` .
- Dataset Cleaning:
    - The original dataset was not formatted for direct upload to Custom Speech.
    - It required pre-processing and manual editing to match the expected format, which led to testing with a small subset first.

### 2.2 Model Training

- Platform: Azure Custom Speech
- Training Data: Audio + transcription dataset
- Endpoint ID: `94347feb-c432-4ef5-b2f0-d2239ff8ce19`

### 2.3 Testing & Evaluation

- Implemented `dm3.ts` for ASR testing.
- Configured `speechRecognitionEndpointId` with the trained model.
- Conducted multiple tests with and without the custom model to compare results.
- Confidence scores were retrieved from the logs using XState and examining the `lastResult` values.

## 3. Results

### 3.1 Performance Improvement

- Recognition Accuracy:
    - Increased confidence scores or decreased the number of attempts done until recognized correctly for previously misrecognized words.
- Notable Fixes:
    - Nietzsche:
        - Without model:
            - First attempt: "Search for nature" (0.82 confidence)
            - Last attempt: "Search for Nietzsche" (0.77 confidence) after 3 attempts.
        - With model:
            - First attempt: "Search for nature" (0.76 confidence)
            - Last attempt: "Search for Nietzsche" (0.68 confidence) after 2 attempts.
    - Schrödinger:
        - Without model:
            - "Tell me about Schrodinger" (0.81 confidence), 1 attempt.
        - With model:
            - "Tell me about Schrodinger" (0.89 confidence), 1 attempt.
    - Daenerys Targaryen:
        - Without model:
            - First attempt: "Who is the nearest Tuggeranian?" (0.69 confidence)
            - Last attempt: "Who is Daenerys Targaryen?" (0.73 confidence) after 4 attempts.
        - With model:
            - First attempt: "Who is the nearest Targaryen?" (0.88 confidence)
            - Last attempt: "Who is Daenerys Targaryen?" (0.73 confidence) after 4 attempts.
    - Cthulhu:
        - Without model:
            - "What is Cthulhu?" (0.65 confidence), 1 attempt.
        - With model:
            - "What is Cthulhu?" (0.73 confidence), 1 attempt.
    - Franz Liszt:
        - Without model:
            - First attempt: "Composer Franz Liszt" (0.53 confidence), 1 attempt.
        - With model:
            - First attempt: "Composer Frank's list" (0.65 confidence)
            - Last attempt: "Composer Franz Liszt" (0.60 confidence) after 2 attempts.
    - Worcestershire:
        - Without model:
            - "Where is Worcestershire?" (0.79 confidence), 1 attempt.
            - With model: "Where is Worcestershire?" (0.87 confidence), 1 attempt.

### 3.2 Persistent Challenges

- Some names still exhibited lower confidence scores due to phonetic similarities (e.g., "Saoirse Ronan").
- The model was tested by me, the non-professional voice actor, so there is a possibility that I did not maintain perfectly consistent pronunciation.
- Although confidence scores generally improved, the performance gain was not significantly large.
- Expanding the dataset could enhance model performance, but manual data preprocessing is required, which is time-consuming.
- Developing a preprocessing function could streamline data preparation and improve efficiency for future experiments.

## 4. Conclusion

- Achievements:
    - The model trained with audio files and transcriptions improved recognition of challenging words.
- Limitations: Some complex names and accents still presented difficulties.
- Future Work:
    - Further training with diverse accents.
    - Incorporation of phonetic variations to improve robustness.
    - Expansion of dataset to include longer phrases containing difficult words.
    - Development of a data preprocessing function to handle formatting issues automatically.