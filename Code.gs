/**
 * This function handles installed onChange events and detects if the IMPORTRANGE() formulas in column 3 have their values changed. 
 * The formulas are importing the value of a checkbox from the external booking sheets that the customers use. Once the value in the
 * 3rd column changes to "TRUE" the rest of the script runs which leads to the customer's booking spreadsheet getting locked and an
 * email sent to them, as well as AJ and the relevant people at PNT.
 * 
 * @param {Event Object} e : The event object generated by the installed onChange trigger.
 * @author Jarren Ralf
 */
function onChange(e)
{
  const sheet = e.source.getActiveSheet();

  if (e.changeType === 'OTHER' && sheet.getSheetName() === 'Dashboard')
  {
    const range = sheet.getDataRange()
    const values = range.getValues()
    var ss = '';

    values[0][1] = '=\"URLs                                           Booking Totals: $\"&TEXT(ROUND(SUM(D2:D)),\"#,###\")'

    for (var row = 1; row < values.length; row++)
    {
      if (values[row][2] === true && !values[row][4] && !ss) // Only enter this conditional once per execution
      {
        ss = SpreadsheetApp.openByUrl(values[row][1])
        DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.NONE)
        fancyEmailBookingOrder(ss)//emailBookingOrder(ss)
        values[row][4] = 'Yes';
        values[row][5] = Utilities.formatDate(new Date(), e.source.getSpreadsheetTimeZone(), "EEE, d MMM  h:mm:ss a")
      }

       if (isNotBlank(values[row][1]))
      {
        values[row][2] = '=IMPORTRANGE(\"' + values[row][1] + '\", \"\'BOOKING PROGRAM\'!D30\")' 
        values[row][3] = '=IF(EQ(IMPORTRANGE(\"' + values[row][1] + '\", \"\'BOOKING PROGRAM\'!B12\"), 0), "",IMPORTRANGE(\"' + values[row][1] + '\", \"\'BOOKING PROGRAM\'!B12\"))'
      }
      else
      {
        values[row][2] = ''
        values[row][3] = ''
      }
    }

    range.setValues(values);
  }
}

/**
 * This function handles installed onEdit events and detects when the user selects the checkbox in the last column that will "unlock" the
 * customer's booking sprreadsheet. This function also checks if a new URL is added to column 2, in chick case, it sets the IMPORTRANGE()
 * formula to the right hand side.
 * 
 * @param {Event Object} e : The event object generated by the installed onChange trigger.
 * @author Jarren Ralf
 */
function installedOnEdit(e)
{
  const range = e.range;
  const row = range.rowStart;
  const col = range.columnStart; 

  if (col === range.columnEnd) // Single column
  {
    if (row === range.rowEnd && row > 1) // Single Cell & Data below the header
    {
      if (col === 2) // A URL has changed in the spreadsheet
      {
        const spreadsheet = e.source;
        const url = spreadsheet.getSheetValues(row, 2, 1, 1)[0][0];

        if (isNotBlank(url))
          spreadsheet.getRange('C' + row + ':D' + row).setFormulas([['=IMPORTRANGE(\"' + url + '\", \"\'BOOKING PROGRAM\'!D30\")', 
            '=IF(EQ(IMPORTRANGE(\"' + url + '\", \"\'BOOKING PROGRAM\'!B12\"), 0), "",IMPORTRANGE(\"' + url + '\", \"\'BOOKING PROGRAM\'!B12\"))']])
      }
      else if (col === 7 && e.value === "TRUE") // The unlock checkbox is selected to true
      {
        const isOrderSubmitted = !range.offset(0, -2, 1, 2).isBlank();

        if (isOrderSubmitted)
        {
          const rng = range.offset(0, -5, 1, 5);
          const values = rng.getValues();
          const ss = SpreadsheetApp.openByUrl(values[0][0])
          
          ss.getRange('BOOKING PROGRAM!A30').uncheck()
          ss.getRange('BOOKING PROGRAM!D30').uncheck()
          ss.getRange('ORDER FORM!A2').uncheck()
          values[0][1] = '=IMPORTRANGE(\"' + values[0][0] + '\",\"\'BOOKING PROGRAM\'!D30\")'; // Reset the importrange
          values[0][2] = '=IF(EQ(IMPORTRANGE(\"' + values[0][0] + '\", \"\'BOOKING PROGRAM\'!B12\"), 0), "",IMPORTRANGE(\"' + values[0][0] + '\", \"\'BOOKING PROGRAM\'!B12\"))'
          values[0][3] = ''
          values[0][4] = ''
          DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT)
          rng.setValues(values)
          range.uncheck()
          e.source.toast('Access has been granted to anyone with a link to the spreadsheet')
        }
        else
        {
          e.source.toast('Preparing booking program...')
          const url = range.offset(0, -5, 1, 1).getValues()[0][0]
          const ss = SpreadsheetApp.openByUrl(url)
          const sheets = ss.getSheets();
          const users = ss.getEditors()
          var sheetName = '', customerName = ''

          DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT)

          for (var s = 0; s < sheets.length; s++)
          {
            sheetName = sheets[s].getSheetName();

            if (sheetName === 'BOOKING PROGRAM')
            {
              customerName = sheets[s].getRange(4, 4).setDataValidation(null).getValue(); // Remove the data validation from the customer cell
              const customer = sheets[s].getRange(5, 4, 9);
              customer.setValues(customer.getValues());
              const ssName = ss.getName();

              if (ssName.split(' - ').length < 2)
                ss.setName(ss.getName() + ' - ' + customerName)
              
              sheets[s].protect().addEditors(users).setUnprotectedRanges([
                sheets[s].getRange('A30'),
                sheets[s].getRange('D30'),
                sheets[s].getRange('B4:B5'), 
                sheets[s].getRange('B22:D28'), 
                sheets[s].getRange('B9:B10')
              ])
            }
            else if (sheetName === 'ORDER FORM')
            {
              const rowStart = 5;
              const rng = sheets[s].getRange(rowStart, 4, sheets[s].getLastRow() - rowStart + 1, 5)
              const values = rng.getValues() 
              var ranges = [sheets[s].getRange(2, 1)], numRows = 0;
              rng.setValues(values) // Remove the formulas that are no longer needed

              for (var i = 0; i < values.length; i++)
              {
                if (isNotBlank(values[i][3]))
                  numRows++;
                else if(numRows !== 0)
                {
                  ranges.push(sheets[s].getRange(i - numRows + rowStart, 9, numRows))
                  numRows = 0;
                }
              }

              sheets[s].protect().addEditors(users).setUnprotectedRanges(ranges);
            }
            else if (sheetName === 'ORDER CONFIRMATION' || sheetName === 'Export')
              sheets[s].hideSheet().protect().addEditors(users).setUnprotectedRanges([sheets[s].getRange('A4')]);
            else
              ss.deleteSheet(sheets[s]);
          }

          ss.getRange('BOOKING PROGRAM!A30').insertCheckboxes().setNumberFormat('0.###############').uncheck()
          ss.getRange('BOOKING PROGRAM!D30').insertCheckboxes().setNumberFormat('0.###############').setFontSize(2).setFontColor('white')
            .setBackground('white').setHorizontalAlignment('right').setVerticalAlignment('bottom').uncheck()
          ss.getRange('ORDER FORM!A2').insertCheckboxes().setNumberFormat('0.###############').uncheck()
          range.offset(0, -6, 1, 1).setValue(customerName)
          range.uncheck()
          e.source.toast('Formulas removed, pages deleted or hidden, spreadsheet protected and now editable by anyone with a link.', customerName, 20)
        }
      }
    }
    else if (col === 2 && row > 1)
    {
      const spreadsheet = e.source;
      const urls = spreadsheet.getSheetValues(row, col, range.rowEnd - row + 1, 1);
      const formulas = urls.map(url => 
        (isNotBlank(url[0])) ? ['=IMPORTRANGE(\"' + url[0] + '\", \"\'BOOKING PROGRAM\'!D30\")', 
          '=IF(EQ(IMPORTRANGE(\"' + url[0] + '\", \"\'BOOKING PROGRAM\'!B12\"), 0), "",IMPORTRANGE(\"' + url[0] + '\", \"\'BOOKING PROGRAM\'!B12\"))'] : ['', '']
      )
      spreadsheet.getActiveSheet().getRange(row, col + 1, formulas.length, 2).setFormulas(formulas)
    }
  }
}

function onOpen()
{
  SpreadsheetApp.getUi().createMenu('Booking Program Controls')
    .addItem('Create Spreadsheets', 'createBookingSpreadsheets')
    .addItem('Create Price Change Trigger', 'createTriggerForPriceChange')
    .addSeparator()
    .addItem('Get Section Headers', 'getSections')
    .addItem('Remove Sections', 'removeSections')
    .addToUi()
}

function changePricing()
{
  SpreadsheetApp.getActive().getRange('B2:C').getValues().map(url => 
    (url[1] !== true) ? SpreadsheetApp.openByUrl(url[0]).getSheetByName('ORDER FORM').getRange('J6').setFormula('=EXTENDED_COST(YourPrice,OrderQty)') : ''
  )
}

function createBookingSpreadsheets()
{
  if (true)
    Browser.msgBox('You can\'t spreadsheets anymore becasue the spreadsheets have already been distributed to customers.')
  else
  {
    const activeUsersEmail = Session.getActiveUser().getEmail();

    if (activeUsersEmail !== 'jarrencralf@gmail.com' && activeUsersEmail !== 'adriangatewood@gmail.com')
      Browser.msgBox('Only Adrian and Jarren have permission to run this function.')
    else
    {
      const sheet = SpreadsheetApp.getActiveSheet();
      const originalSS_Url = sheet.getRange(2, 2).getValue();
      const originalSS = SpreadsheetApp.openByUrl(originalSS_Url);
      const customersSheet = originalSS.getSheetByName('Customers');
      const customers = customersSheet.getSheetValues(2, 1, customersSheet.getLastRow() - 1, 1);
      var urls = [], url = '', ss;

      customers.map( customer => {
        ss = originalSS.copy('Pacific Net & Twine Ltd. 2024 Booking Program - ' + customer[0])
        ss.getSheetByName('BOOKING PROGRAM').getRange(4, 4).setDataValidation(null).setValue(customer[0])
        url = ss.getUrl()

        return urls.push([url, '=IMPORTRANGE(\"' + url + '\", \"\'BOOKING PROGRAM\'!D30\")', 
          '=IF(EQ(IMPORTRANGE(\"' + url + '\", \"\'BOOKING PROGRAM\'!B12\"), 0), "",IMPORTRANGE(\"' + url + '\", \"\'BOOKING PROGRAM\'!B12\"))'])
      })
      sheet.getRange(2, 2, customers.length, 3).setValues(urls);
    }
  }
}

function createTriggerForPriceChange()
{
  const url = SpreadsheetApp.getActive().getSheetByName('Dashboard').getSheetValues(2, 2, 1, 1)[0][0];
  const submissionBy = SpreadsheetApp.openByUrl(url).getSheetByName('BOOKING PROGRAM').getSheetValues(6, 2, 1, 1)[0][0].split(', ');
  const months = {'JANUARY': 1, 'FEBRUARY': 2, 'MARCH': 3, 'APRIL': 4, 'MAY': 5, 'JUNE': 6, 'JULY': 7, 'AUGUST': 8, 'SEPTEMBER': 9, 'OCTOBER': 10, 'NOVEMBER': 11, 'DECEMBER': 12};

  const year = (submissionBy[submissionBy.length - 1].length === 4) ? submissionBy[submissionBy.length - 1] : new Date().getFullYear()
  const month = months[submissionBy[submissionBy.length - 2].split(' ', 1)[0]]
  const day = Number(submissionBy[submissionBy.length - 2].replace(/\D/g, '')) + 7
  
  ScriptApp.newTrigger('changePricing').timeBased().atDate(year, month, day).create()
}

function testEmails()
{
  spreadsheet = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1Ndlow31wOBnx5I9cRDk7j_ys2B9ViWWlJu-JeVkS3qU/edit#gid=2140966653");
  emailBookingOrder(spreadsheet)
}

/**
 * This function .... 
 * 
 * @param {Spreadsheet} spreadsheet : The ...
 * @author Jarren Ralf
 */
function emailBookingOrder(spreadsheet)
{
  const exportSheet = spreadsheet.getSheetByName('Export')
  const orderInformationSheet = spreadsheet.getSheetByName('BOOKING PROGRAM')
  const orderConfirmationSheet = spreadsheet.getSheetByName('ORDER CONFIRMATION')
  
  const customerValues = orderInformationSheet.getSheetValues(4, 2, 10, 3)
  const poNum = customerValues[0][0]
  const customer = customerValues[0][2]
  const pntSalesRep = customerValues[9][2];
  const contactName = (isNotBlank(customerValues[5][2])) ? customerValues[5][2].split(' ', 1)[0] : customer; // Contact's first name, or the business name (if contact is blank)
  var pntSalesRepEmail = '', pntSalesRepPhoneNum = '';

  const recipientEmail = customerValues[7][2];

  switch (pntSalesRep)
  {
    case "Kris Nakashima":
      pntSalesRepEmail = 'kris@pacificnetandtwine.com'
      pntSalesRepPhoneNum = '604-370-7325'
      break;
    case "Mark Westerlaken":
      pntSalesRepEmail = 'mark@pacificnetandtwine.com'
      pntSalesRepPhoneNum = '604-370-7326'
      break;
    case "Derrick Mizuyabu":
      pntSalesRepEmail = 'dmizuyabu@pacificnetandtwine.com';
      pntSalesRepPhoneNum = '604-370-7327'
      break;
    case "Brent Kondo":
      pntSalesRepEmail = 'brent@pacificnetandtwine.com'
      pntSalesRepPhoneNum = '604-370-7328'
      break;
  }

  var templateHtml = HtmlService.createTemplateFromFile('email');
  templateHtml.salesRep = pntSalesRep;
  templateHtml.phoneNum = pntSalesRepPhoneNum;
  templateHtml.contactName = contactName;

  const blindRecipients = "kris@pacificnetandtwine.com, mark@pacificnetandtwine.com, dmizuyabu@pacificnetandtwine.com, brent@pacificnetandtwine.com"
  var emailSubject = 'Booking Order for ' + poNum + ' confirmed';
  var emailSignature = '<p>If you have any questions, please click reply or send an email to: <a href="mailto:' + pntSalesRepEmail + '?subject=Booking Order for ' + 
    poNum + ' placed by ' + customer + '">' + pntSalesRepEmail + '</a></p>'
  var message = templateHtml.evaluate().append(emailSignature).getContent(); // Get the contents of the html document

  var      adagioExportCsv = getAsBlob(spreadsheet,            exportSheet).setName(customer + ' ' + poNum + ".csv")
  var  orderInformationPdf = getAsBlob(spreadsheet,  orderInformationSheet).setName(customer + ' ' + poNum + " Booking Information.pdf")
  var orderConfirmationPdf = getAsBlob(spreadsheet, orderConfirmationSheet).setName(customer + ' ' + poNum + " Order Confirmation.pdf")
  const attachments = [orderInformationPdf, orderConfirmationPdf];

  // Send an email with following chosen parameters to the customer and to the relevant people at PNT
  GmailApp.sendEmail(recipientEmail, 
                      emailSubject, 
                      '',
                    {   replyTo: pntSalesRepEmail,
                            bcc: blindRecipients,
                           from: 'pntnoreply@gmail.com',
                           name: 'PNT Sales',
                       htmlBody: message,
                    attachments: attachments
  });

  attachments.push(adagioExportCsv)

  // Send an email to AJ that will also include the csv file to
  GmailApp.sendEmail('adrian@pacificnetandtwine.com', 
                      emailSubject, 
                      '',
                    {   replyTo: pntSalesRepEmail,
                            bcc: 'lb_blitz_allstar@hotmail.com',
                           from: 'pntnoreply@gmail.com',
                           name: 'PNT Sales',
                       htmlBody: message,
                    attachments: attachments
  });
}

/**
 * This function .... 
 * 
 * @param {Spreadsheet} spreadsheet : The ...
 * @author Jarren Ralf
 */
function fancyEmailBookingOrder(spreadsheet)
{
  const exportSheet = spreadsheet.getSheetByName('Export')
  const orderInformationSheet = spreadsheet.getSheetByName('BOOKING PROGRAM')
  const orderConfirmationSheet = spreadsheet.getSheetByName('ORDER CONFIRMATION')
  
  const customerValues = orderInformationSheet.getSheetValues(4, 2, 25, 3)
  const poNum = customerValues[0][0]
  const customer = customerValues[0][2]
  const pntSalesRep = customerValues[9][2];
  const contactName = (isNotBlank(customerValues[5][2])) ? customerValues[5][2].split(' ', 1)[0] : customer; // Contact's first name, or the business name (if contact is blank)
  var pntSalesRepEmail = '', pntSalesRepPhoneNum = '';

  const recipientEmail = customerValues[7][2]; // The email will be send to this address

  switch (pntSalesRep)
  {
    case "Kris Nakashima":
      pntSalesRepEmail = 'kris@pacificnetandtwine.com'
      pntSalesRepPhoneNum = '604-370-7325'
      break;
    case "Mark Westerlaken":
      pntSalesRepEmail = 'mark@pacificnetandtwine.com'
      pntSalesRepPhoneNum = '604-370-7326'
      break;
    case "Derrick Mizuyabu":
      pntSalesRepEmail = 'dmizuyabu@pacificnetandtwine.com';
      pntSalesRepPhoneNum = '604-370-7327'
      break;
    case "Brent Kondo":
      pntSalesRepEmail = 'brent@pacificnetandtwine.com'
      pntSalesRepPhoneNum = '604-370-7328'
      break;
  }

  var templateHtml = HtmlService.createTemplateFromFile('fancyEmail');
  templateHtml.contactName = contactName;
  templateHtml.salesRep = pntSalesRep;
  templateHtml.phoneNum = pntSalesRepPhoneNum;
  templateHtml.poNum = poNum;
  templateHtml.carrier = customerValues[5][0];
  templateHtml.total = Math.round((customerValues[8][0] + Number.EPSILON) * 100) / 100;
  templateHtml.customer = customer;
  templateHtml.address = customerValues[1][2];
  templateHtml.city = customerValues[2][2];
  templateHtml.province = customerValues[3][2];
  templateHtml.postalCode = customerValues[4][2];
  templateHtml.contact = customerValues[5][2];
  templateHtml.phone = customerValues[6][2];
  templateHtml.email = recipientEmail;
  templateHtml.accountNum = customerValues[8][2];
  templateHtml.comments1 = customerValues[18][0];
  templateHtml.comments2 = customerValues[19][0];
  templateHtml.comments3 = customerValues[20][0];
  templateHtml.comments4 = customerValues[21][0];
  templateHtml.comments5 = customerValues[22][0];
  templateHtml.comments6 = customerValues[23][0];
  templateHtml.comments7 = customerValues[24][0];


  const blindRecipients = "kris@pacificnetandtwine.com, mark@pacificnetandtwine.com, dmizuyabu@pacificnetandtwine.com, brent@pacificnetandtwine.com"
  var emailSubject = 'Booking Order for PO# ' + poNum + ' confirmed';
  var emailSignature = '<p>If you have any questions, please click reply or send an email to: <a href="mailto:' + pntSalesRepEmail + '?subject=Booking Order for PO# ' + 
    poNum + ' placed by ' + customer + '">' + pntSalesRepEmail + '</a></p>'
  var message = templateHtml.evaluate().append(emailSignature).getContent(); // Get the contents of the html document

  var      adagioExportCsv = getAsBlob(spreadsheet,            exportSheet).setName(customer + ' PO# ' + poNum + ".csv")
  var orderConfirmationPdf = getAsBlob(spreadsheet, orderConfirmationSheet).setName(customer + ' PO# ' + poNum + " Order Confirmation.pdf")
  const attachments = [orderConfirmationPdf];
  const image = {"pntLogo": UrlFetchApp.fetch("https://cdn.shopify.com/s/files/1/0018/7079/0771/files/logoh_180x@2x.png?v=1613694206").getBlob()}

  // Send an email with following chosen parameters to the customer and to the relevant people at PNT
  GmailApp.sendEmail(recipientEmail, 
                      emailSubject, 
                      '',
                    {   replyTo: pntSalesRepEmail,
                            bcc: blindRecipients,
                           from: 'pntnoreply@gmail.com',
                           name: 'PNT Sales',
                       htmlBody: message,
                    attachments: attachments,
                   inlineImages: image
  });

  attachments.push(adagioExportCsv)

  // Send an email to AJ that will also include the csv file to
  GmailApp.sendEmail('adrian@pacificnetandtwine.com',
                      emailSubject, 
                      '',
                    {   replyTo: pntSalesRepEmail,
                            bcc: 'lb_blitz_allstar@hotmail.com',
                           from: 'pntnoreply@gmail.com',
                           name: 'PNT Sales',
                       htmlBody: message,
                    attachments: attachments,
                   inlineImages: image
  });
}

/**
 * This function converts the given sheet into a BLOB object. Based on the second argument, namely which sheet is getting converted, certain parameters are 
 * set that lead to the BLOB object being stored as a csv or pdf file.
 * 
 * @license MIT
 * 
 * © 2020 xfanatical.com. All Rights Reserved.
 * @param {Spreadsheet} spreadsheet : The specific spreadsheet that will be used to convert the export page into a BLOB (Binary Large Object)
 * @return The packing slip sheet as a BLOB object that will eventually get converted to pdf document that will be attached to an email sent to the customer
 * @author Jason Huang
 */
function getAsBlob(spreadsheet, sheet)
{
  // A credit to https://gist.github.com/Spencer-Easton/78f9867a691e549c9c70
  // these parameters are reverse-engineered (not officially documented by Google)
  // they may break overtime.

  var format = '', isPortrait = '';

  switch (sheet.getSheetName())
  {
    case "Export":
      format = 'csv';
      isPortrait = 'true';
      break;
    case "ORDER CONFIRMATION":
      format = 'pdf';
      isPortrait = 'false';
      break;
  }

  var exportUrl = spreadsheet.getUrl().replace(/\/edit.*$/, '') + '/export?'
      + 'exportFormat=' + format
      + '&format=csv'
      + '&size=LETTER'
      + '&portrait=' + isPortrait
      + '&fitw=true&top_margin=0.75&bottom_margin=0.75&left_margin=0.25&right_margin=0.25'           
      + '&sheetnames=false&printtitle=false&pagenum=UNDEFINED&gridlines=false&fzr=TRUE'
      + '&gid=' + sheet.getSheetId();

  var response;

  for (var i = 0; i < 5; i++)
  {
    response = UrlFetchApp.fetch(exportUrl, {
      muteHttpExceptions: true,
      headers: { 
        Authorization: 'Bearer ' +  ScriptApp.getOAuthToken(),
      },
    })

    if (response.getResponseCode() === 429)
      Utilities.sleep(3000) // printing too fast, retrying
    else
      break;
  }
  
  if (i === 5)
    throw new Error('Printing failed. Too many sheets to print.');
  
  return response.getBlob()
}

function getSections()
{
  const sectionSheet = SpreadsheetApp.getActiveSheet();

  if (sectionSheet.getSheetName() !== 'Section Removal')
  {
    Browser.msgBox('You must be on the Section Removal sheet to run this function')
    SpreadsheetApp.getActive().getSheetByName('Section Removal').activate();
  }
  else 
  {
    const url = sectionSheet.getRange('A4').getValue()
    const orderSheet = SpreadsheetApp.openByUrl(url).getSheetByName('ORDER FORM')
    const range = orderSheet.getRange(4, 1, orderSheet.getLastRow() - 3);
    const colours = range.getBackgrounds();
    const values = range.getValues();
    const numRows = 1;
    var sectionRemovalValues = [[] ,[],[]], col = -1;
    
    for (var row = 0; row < values.length; row++)
    {
      if (colours[row][0] == '#6d9eeb')
      {
        sectionRemovalValues[0].push(values[row][0])
        sectionRemovalValues[1].push(row + 4)
        sectionRemovalValues[2].push(numRows)
        col++
      }
      else
        sectionRemovalValues[2][col]++;
    }

    sectionSheet.getRange(1, 3, 3, sectionRemovalValues[0].length).setValues(sectionRemovalValues)
  }
}

/**
 * This function checks if the given string is not blank.
 * 
 * @param {String} str : The given string
 * @return {Boolean} Whether the given string is not blank or it is blank.
 * @author Jarren Ralf
 */
function isNotBlank(str)
{
  return str !== '';
}

function removeSections()
{
  if (true)
    Browser.msgBox('You can\'t delete sections anymore becasue the spreadsheets have already been distributed to customers.')
  else
  {
    const activeUsersEmail = Session.getActiveUser().getEmail();
    
    if (activeUsersEmail !== 'jarrencralf@gmail.com' && activeUsersEmail !== 'adriangatewood@gmail.com')
      Browser.msgBox('Only Adrian and Jarren have permission to run this function.')
    else
    {
      const sectionSheet = SpreadsheetApp.getActiveSheet();

      if (sectionSheet.getSheetName() !== 'Section Removal')
      {
        SpreadsheetApp.getActive().getSheetByName('Section Removal').activate();
        Browser.msgBox('You must be on the Section Removal sheet to run this function')
      }
      else 
      {
        const sectionValues = SpreadsheetApp.getActiveSheet().getDataRange().getValues()
        var sections = [], orderSheet;

        for (var i = 3; i < sectionValues.length; i++)
        {
          for (var j = sectionValues[0].length - 1; j > 1; j--)
          {
            if (sectionValues[i][j] !== true)
              sections.push([sectionValues[1][j], sectionValues[2][j]])
          }

          if (sections.length !== 0)
          {
            orderSheet = SpreadsheetApp.openByUrl(sectionValues[i][0]).getSheetByName('ORDER FORM');
            sections.map(row => orderSheet.deleteRows(row[0], row[1]))
            sections.length = 0;
          }
        }
      }
    }
  }
}