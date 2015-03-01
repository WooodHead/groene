var fs = require('fs');
var userdata = require('../config.json');
var request = require('request').defaults({jar: true})
var cheerio = require('cheerio');
var Url = require('url');
var Path = require('path');
var base = 'https://www.groene.nl';

var book = {
  title : "De Groene Amsterdammer",
  categories : [],
  languages : ["nl-NL"],
  creator : {
    name : "Groene Amsterdammer",
    role : "aut",
    "file-as" : "Groene Amsterdammer"
  },
  publisher : "NV Weekblad De Groene Amsterdammer",
  css : fs.readFileSync('style.css', {encoding:'utf-8'}),
  issue : (function(){
    var today = new Date();
    //today.setHours(0, 0, 0, 0);
    var year = today.getFullYear();
    var jan1 = new Date();
    jan1.setHours(12,0,0,0);    // Time of a new issue being published
    jan1.setMonth(-1)           // They started with #1 on (Wednesday)
    jan1.setDate(31)            // Dec 31 for the year 2015
    var week = Math.ceil(((today.getTime() -
                           jan1.getTime()) / 86400000) / 7);
    return week;
  })(),
  pages : []
};
// @todo: scrape http://www.groene.nl/pagina/colofon for contributors
// and add all authors.  See
// http://www.idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.2.6
// for roles
// @todo (?) Add tags as subjects.
book.readyForPrinting = function(){
  return (book.pages.filter(function(page){
    return page.body !== undefined;
  })).length === book.pages.length;
}

book.url = (function(){
  return Url.resolve(base, (new Date()).getFullYear() + '/' + book.issue);
})();

book.title = book.title + ' #' + book.issue;

var Helper = {
  login_url : Url.resolve(base, 'gebruiker/inloggen')
}

function login(){
  request
    .get({'uri' : Helper.login_url},
         function(error, response, body) {
           var $ = cheerio.load(body);
           var $token = $("#new_user.full-page-form input[name=authenticity_token]");
           var name = $token.attr('name');
           var token = $token.val();
           // console.log(name + " -> " + token);
           var data = {
             authenticity_token : token,
             'user[email]' : userdata.user,
             'user[password]' : userdata.pass
           }
           request.post({'uri' : Helper.login_url,
                         form: data,
                         
                         followAllRedirects : true
                        }, afterLogin)
         })
}

function afterLogin(err, res, body){
  console.log('Downloading issue', book.issue);
  request.get({uri : book.url,
               followAllRedirects : true },
              parseIndex);
}

function parseIndex(err, res, body){
  if (res.statusCode === 404
      || (body.indexOf(404) > -1)) {
    console.error('Issue ' + book.issue + ' not (yet) available')
    process.exit(11);
  }
  var $ = cheerio.load(body);
  book.cover = base + $('.cover img').attr('src');
  var pgNum = -1;

  $('#column-everyone section.category-articles')
    .each(function(n){
      pgNum++;
      var category = $(this).find('h3').text();
      book.categories[category] = [];
      var tocArticle = {
        title : '» ' + category,
        url : Url.resolve(base, 'category/' + category),
        hidden: true,
        toc : true,             // maybe not...
        body : '<h3>' + category + '</h3>'
      }
      book.pages.push(tocArticle);
      $(this).find('article').each(function(n){
        pgNum++;
        var pad      = "00000";
        var name     = 'e' + (pad+pgNum.toString()).slice(-pad.length);
        var path = name + '.html';

        var article =
              { title : $(this).find('h4').text(),
                description : $(this).find('h5').text(),
                url : Url.resolve(base, $(this).find('a').attr('href')),
                // href : Path.basename($(this).find('a').attr('href')),
                toc : true,
                author : $(this).find('p').text().replace(/^door /, '') };
        
        tocArticle.body += '<p><a href="' + path + '">' + article.title + '</a></p>';
        
        book.pages.push(article);
        request.get(article.url, function(err, res, body){
          var $ = cheerio.load(body);
          var $body = $('.main-article');
          $body.find('footer, .article-social-top, time').remove();
          // Remove empty paragraphs.
          $body.find('p:empty').remove();
          $body.find('blockquote').each(function(){
            if ($(this).text().charAt(0) === "‘")
              $(this).addClass('minhair');
          });
          $body.find('.T_tekst_artikel,'
                    + '.T_tekst_artikel_geen inspring,'
                    + '.T_tekst_artikel_kort,'
                    + '.T_tekst_artikel_lang,'
                    + '.T_tekst_naschrift_lijn')
          .attr('class', null);
          $body.find('.T_tekst_kleinkapitaal').each(function(){
            $(this).replaceWith($('<abbr>' + $(this).text().toUpperCase() + '</abbr>'))
          })
          // Do not let links open browser. 
          $body.find('header img, .main-article-content body img')
            .each(function(){
              $(this).attr('src', Url.resolve(base, $(this).attr('src')))
            })
          $body.find('.author').html($body.find('.author').text())
          $body.find('.credits').html($body.find('.credits').text())
          article.body =
            ( $body.find('.tags').html() ?
              '<div class="tags">' + $body.find('.tags').html() + "</tags>"
              : '' )
            + $body.find('header').html()
            + ( $body.find('.main-article-content body').html() // Fix DOCTYPE bug on website
                || $body.find('.main-article-content').html() )
          if (book.readyForPrinting()){
            createEpub();
          }
        });          
        // console.log(article);
        // book.categories[category].push(article);
      });
    })
}

function createEpub(){
  var Peepub = require('pe-epub');
  //console.log(book);
  var myPeepub = new Peepub(book);
  var pad      = "00";
  var filename = 'GroeneAmsterdammer#'
        + (pad+book.issue.toString()).slice(-pad.length)
        + '.epub';
  myPeepub.create(filename)
  .then(function(filePath){
    console.log(filePath); // the same path to your epub file!
  });
}


login();
