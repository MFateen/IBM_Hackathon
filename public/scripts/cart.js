

// data = {"name": "Panadol", "Price": 32, "Amount": "not"};

$( document ).ready(function() {
  $.post("/getcart", { }, function(data, status){
  	data = JSON.parse(data);
  	console.log(data)
  	console.log(data.length);
  	htmlString = "";
  	data.forEach(function(element){
  		console.log(element)
  		htmlString += `<tr>
							<td>` + element.medicine + `</td>
							<td><span class="badge">` + element.quantity + `</span></td >
						</tr>`;
  	});
  	
  	if (htmlString === "") {
  		htmlString = "<tr><td colspan='2'>Your cart is empty</td></tr>";
  		$(".cart-button").hide();
  	}
  	
  	$("#cart_content").html(htmlString);

  });
});

function order() {
	$.post("/emptycart", { }, function(data, status){
		  	window.location.assign("home.html");
	});
}