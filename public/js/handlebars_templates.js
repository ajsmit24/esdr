!function(){var a=Handlebars.template,l=Handlebars.templates=Handlebars.templates||{};l["client-list-item"]=a({1:function(a,l,n,e,t){return'<span class="glyphicon glyphicon-ok"></span>'},compiler:[7,">= 4.0.0"],main:function(a,l,n,e,t){var i,s,m=null!=l?l:{},p=n.helperMissing,c="function",d=a.escapeExpression;return"<tr>\n   <td>"+d((s=null!=(s=n.displayName||(null!=l?l.displayName:l))?s:p,typeof s===c?s.call(m,{name:"displayName",hash:{},data:t}):s))+"</td>\n   <td>"+d((s=null!=(s=n.clientName||(null!=l?l.clientName:l))?s:p,typeof s===c?s.call(m,{name:"clientName",hash:{},data:t}):s))+"</td>\n   <td>"+d((s=null!=(s=n.email||(null!=l?l.email:l))?s:p,typeof s===c?s.call(m,{name:"email",hash:{},data:t}):s))+"</td>\n   <td>"+(null!=(i=n["if"].call(m,null!=l?l.isPublic:l,{name:"if",hash:{},fn:a.program(1,t,0),inverse:a.noop,data:t}))?i:"")+"</td>\n</tr>"},useData:!0})}();