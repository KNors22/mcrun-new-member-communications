/*
Copyright 2025 Andrey Gonzalez (for McGill Students Running Club)

Copyright 2022 Martin Hawksey

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

THIS FILE HAS BEEN MODIFIED BY ANDREY GONZALEZ AS FOLLOWING:
- Reconfigured data retrieval of new member registrations
- Removed `onOpen()` and menu creation for script executions
- Deleted redundant comments

- Modifications of `sendEmails()`:
  * Removed browser prompt
  * Modified parameters to target row instead of sheet-wide
  * Changed scope of helper functions to project-wide
*/


/**
 * Sends emails from sheet data.
 * 
 * @author  Martin Hawksey (2022)
 * @update  [Andrey Gonzalez](<andrey.gonzalez@mail.mcgill.ca>) (2025)
 * 
 * @param {Object} memberInformation  Information to populate email draft
 * @return {string}  Status of sending email
*/
function sendEmail(memberInformation) {
  // Gets the draft Gmail message to use as a template
  const emailTemplate = getGmailTemplateFromDrafts_(subjectLine);

  // Gets the data from the passed sheet
  const dataRange = sheet.getDataRange();
  // Fetches displayed values for each row in the Range HT Andrew Roberts 
  // https://mashe.hawksey.info/2020/04/a-bulk-email-mail-merge-with-gmail-and-google-sheets-solution-evolution-using-v8/#comment-187490
  // @see https://developers.google.com/apps-script/reference/spreadsheet/range#getdisplayvalues
  const data = dataRange.getDisplayValues();

  // Get header with placeholder names
  const placeholder = Object.keys(memberInformation);

  // Gets the index of the column named 'Email Status' (Assumes header names are unique)
  const emailSentColIdx = placeholder.indexOf(COL_MAP.STATUS_EMAIL);

  // Converts 2d array into an object array
  // See https://stackoverflow.com/a/22917499/1027723
  // For a pretty version, see https://mashe.hawksey.info/?p=17869/#comment-184945
  const obj = data.map(r => (placeholder.reduce((o, k, i) => (o[k] = r[i] || '', o), {})));

  // Loops through all the rows of data
  obj.forEach(function(row, rowIdx){
    // Only sends emails if email_sent cell is blank and not hidden by a filter
    if (row[COL_MAP.STATUS_EMAIL] == ''){
      try {
        const msgObj = fillInTemplateFromObject_(emailTemplate.message, row);

        // See https://developers.google.com/apps-script/reference/gmail/gmail-app#sendEmail(String,String,String,Object)
        // If you need to send emails with unicode/emoji characters change GmailApp for MailApp
        // Uncomment advanced parameters as needed (see docs for limitations)
        GmailApp.sendEmail(row[COL_MAP.EMAIL], msgObj.subject, msgObj.text, {
          htmlBody: msgObj.html,
          from: 'mcrunningclub@ssmu.ca',
          name: 'McRUN',
          replyTo: 'mcrunningclub@ssmu.ca',
          attachments: emailTemplate.attachments,
          inlineImages: emailTemplate.inlineImages
        });
        // Edits cell to record email sent date
        out.push([new Date()]);
      } catch(e) {
        // modify cell to record error
        out.push([e.message]);
      }
    } else {
      out.push([row[COL_MAP.STATUS_EMAIL]]);
    }
  });
}


/**
 * Get a Gmail draft message by matching the subject line.
 * @param {string} subject_line to search for draft message
 * @return {object} containing the subject, plain and html message body and attachments
*/
function getGmailTemplateFromDrafts_(subject_line){
  try {
    // Get the target draft, then message object
    const drafts = GmailApp.getDrafts();
    const draft = drafts.filter(subjectFilter_(subject_line))[0];
    const msg = draft.getMessage();

    // Handles inline images and attachments so they can be included in the merge
    // Based on https://stackoverflow.com/a/65813881/1027723
    // Gets all attachments and inline image attachments
    const allInlineImages = draft.getMessage().getAttachments({includeInlineImages: true,includeAttachments:false});
    const attachments = draft.getMessage().getAttachments({includeInlineImages: false});
    const htmlBody = msg.getBody(); 

    // Creates an inline image object with the image name as key 
    // (can't rely on image index as array based on insert order)
    const img_obj = allInlineImages.reduce((obj, i) => (obj[i.getName()] = i, obj) ,{});

    //Regexp searches for all img string positions with cid
    const imgexp = RegExp('<img.*?src="cid:(.*?)".*?alt="(.*?)"[^\>]+>', 'g');
    const matches = [...htmlBody.matchAll(imgexp)];

    //Initiates the allInlineImages object
    const inlineImagesObj = {};
    // built an inlineImagesObj from inline image matches
    matches.forEach(match => inlineImagesObj[match[1]] = img_obj[match[2]]);

    return {message: {subject: subject_line, text: msg.getPlainBody(), html:htmlBody}, 
            attachments: attachments, inlineImages: inlineImagesObj };
  } catch(e) {
    throw new Error("Oops - can't find Gmail draft");
  }
}







/**
   * Filter draft objects with the matching subject linemessage by matching the subject line.
   * @param {string} subject_line to search for draft message
   * @return {object} GmailDraft object
  */
  function subjectFilter_(subject_line){
    return function(element) {
      if (element.getMessage().getSubject() === subject_line) {
        return element;
      }
    }
  }


/**
 * Escape cell data to make JSON safe
 * @see https://stackoverflow.com/a/9204218/1027723
 * @param {string} str to escape JSON special characters from
 * @return {string} escaped string
*/
function escapeData_(str) {
  return str
    .replace(/[\\]/g, '\\\\')
    .replace(/[\"]/g, '\\\"')
    .replace(/[\/]/g, '\\/')
    .replace(/[\b]/g, '\\b')
    .replace(/[\f]/g, '\\f')
    .replace(/[\n]/g, '\\n')
    .replace(/[\r]/g, '\\r')
    .replace(/[\t]/g, '\\t');
};


/**
 * Fill template string with data object
 * @see https://stackoverflow.com/a/378000/1027723
 * @param {string} template string containing {{}} markers which are replaced with data
 * @param {object} data object used to replace {{}} markers
 * @return {object} message replaced with data
*/
function fillInTemplateFromObject_(template, data) {
  // We have two templates one for plain text and the html body
  // Stringifing the object means we can do a global replace
  let template_string = JSON.stringify(template);

  // Token replacement
  template_string = template_string.replace(/{{[^{}]+}}/g, key => {
    return escapeData_(data[key.replace(/[{}]+/g, "")] || "");
  });
  return  JSON.parse(template_string);
}

